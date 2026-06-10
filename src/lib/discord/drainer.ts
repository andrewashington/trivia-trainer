import { db } from "@/lib/db";
import { specFor } from "@/lib/discord/feed";
import type { OutboxEventType } from "@/lib/outbox";

/**
 * In-process outbox drainer (phase-1 Discord feed). Railway runs one
 * long-lived container, so a simple interval honors the app's "no
 * cron at friend-group scale" rule. Started from instrumentation.ts;
 * a no-op unless DISCORD_WEBHOOK_URL is set.
 *
 * Rules:
 * - rows whose type isn't in the curated map are marked processed
 *   without posting (the channel stays highlights-only);
 * - a failed post leaves the row unprocessed for the next tick;
 * - after MAX_ATTEMPTS (tracked in memory — a restart just retries,
 *   which is fine) the row is marked processed so one poison event
 *   can't dam the queue;
 * - BATCH and the per-post delay keep us politely under Discord's
 *   webhook rate ceiling, irrelevant at this scale but correct.
 */

const TICK_MS = 30_000;
const BATCH = 5;
const MAX_ATTEMPTS = 5;

let started = false;
let draining = false;
const attempts = new Map<string, number>();

export function startDiscordDrainer() {
  if (started) return;
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.log("[discord] DISCORD_WEBHOOK_URL not set; feed disabled");
    return;
  }
  started = true;
  console.log("[discord] outbox drainer started");
  setInterval(() => void drain(), TICK_MS).unref?.();
  // First pass shortly after boot so a deploy doesn't sit on a backlog.
  setTimeout(() => void drain(), 5_000).unref?.();
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    const rows = await db.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });
    for (const row of rows) {
      try {
        await postRow(row.id, row.type as OutboxEventType, row.payload);
        attempts.delete(row.id);
      } catch (err) {
        const n = (attempts.get(row.id) ?? 0) + 1;
        attempts.set(row.id, n);
        console.error(`[discord] post failed (attempt ${n}) for ${row.type}:`, err);
        if (n >= MAX_ATTEMPTS) {
          attempts.delete(row.id);
          await markProcessed(row.id);
          console.error(`[discord] giving up on outbox row ${row.id}`);
        }
        break; // keep ordering; retry from this row next tick
      }
    }
  } catch (err) {
    console.error("[discord] drain tick failed:", err);
  } finally {
    draining = false;
  }
}

async function postRow(id: string, type: OutboxEventType, payload: unknown) {
  const spec = specFor(type, (payload ?? {}) as Record<string, unknown>);
  if (!spec) {
    await markProcessed(id);
    return;
  }

  let actorName: string | null = null;
  if (spec.actorId) {
    const actor = await db.user.findUnique({
      where: { id: spec.actorId },
      select: { displayName: true, email: true },
    });
    actorName = actor?.displayName ?? actor?.email?.split("@")[0] ?? null;
  }

  // Lazy imports keep next/og out of the module graph until a card is
  // actually needed.
  const [{ renderCardPng }, { postCardToDiscord }] = await Promise.all([
    import("@/lib/discord/card"),
    import("@/lib/discord/webhook"),
  ]);
  const png = await renderCardPng(spec, actorName);
  await postCardToDiscord(spec, actorName, png);
  await markProcessed(id);
  // Stay far below Discord's per-webhook rate limit when batching.
  await new Promise((r) => setTimeout(r, 750));
}

function markProcessed(id: string) {
  return db.outboxEvent.update({ where: { id }, data: { processedAt: new Date() } });
}
