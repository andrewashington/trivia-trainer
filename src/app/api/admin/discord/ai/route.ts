import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/appConfig";
import { getDiscordSettings } from "@/lib/discord/settings";
import { requireAdmin } from "@/lib/session";
import { aiSettingsPut, memoryCreate } from "@/modules/admin/schema";
import { ASSISTANT_SYSTEM_DEFAULT } from "@/lib/discord/assistant";
import { SPONTANEOUS_SYSTEM_DEFAULT } from "@/lib/discord/spontaneous";
import { RERANK_SYSTEM_DEFAULT } from "@/lib/discord/rerank";

/**
 * Admin surface for the Discord AI assistant: the archive→segment→embedding
 * "data funnel" status, the remembered-facts store (CRUD), and the AI tuning
 * fields (which live inside discord.settings alongside the feature toggles).
 */

type FunnelRow = { messages: bigint; channels_with_msgs: bigint; channels_total: bigint };
type SegRow = { segments: bigint; embedded: bigint; embed_model: string | null };

/** GET — funnel status + active memories + current AI settings. */
export const GET = apiHandler(async () => {
  await requireAdmin();

  const [funnel] = await db.$queryRaw<FunnelRow[]>`
    SELECT
      (SELECT count(*) FROM discord_archive.messages WHERE deleted_at IS NULL) AS messages,
      (SELECT count(DISTINCT channel_id) FROM discord_archive.messages) AS channels_with_msgs,
      (SELECT count(*) FROM discord_archive.channels) AS channels_total
  `;
  const [seg] = await db.$queryRaw<SegRow[]>`
    SELECT
      (SELECT count(*) FROM discord_archive.message_segments) AS segments,
      (SELECT count(*) FROM discord_archive.segment_embeddings) AS embedded,
      (SELECT model FROM discord_archive.segment_embeddings LIMIT 1) AS embed_model
  `;

  const memories = await db.discordMemory.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, fact: true, subject: true, createdAt: true },
  });

  // Recent run traces for the troubleshooting panel (best-effort: the table may
  // not exist until this feature's migration has run in prod).
  const runs = await db.discordAssistantRun
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        surface: true,
        prompt: true,
        modelRequest: true,
        modelUsed: true,
        fellBack: true,
        ok: true,
        steps: true,
        toolCalls: true,
        latencyMs: true,
        error: true,
        reply: true,
        trace: true,
        createdAt: true,
      },
    })
    .catch(() => []);

  const s = await getDiscordSettings();

  return NextResponse.json({
    funnel: {
      messages: Number(funnel?.messages ?? 0),
      channelsWithMsgs: Number(funnel?.channels_with_msgs ?? 0),
      channelsTotal: Number(funnel?.channels_total ?? 0),
      segments: Number(seg?.segments ?? 0),
      embedded: Number(seg?.embedded ?? 0),
      embedModel: seg?.embed_model ?? null,
      embeddingsEnabled: process.env.DISCORD_EMBEDDINGS_ENABLED === "true",
    },
    memories: memories.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    runs: runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    settings: {
      aiSystemPrompt: s.aiSystemPrompt,
      aiPromptAssistant: s.aiPromptAssistant,
      aiPromptSpontaneous: s.aiPromptSpontaneous,
      aiPromptRerank: s.aiPromptRerank,
      aiSemanticSearch: s.aiSemanticSearch,
      aiRerank: s.aiRerank,
      aiSearchLimit: s.aiSearchLimit,
      aiMaxSteps: s.aiMaxSteps,
      aiMaxTokens: s.aiMaxTokens,
      aiModel: s.aiModel,
      spontaneousEnabled: s.spontaneousEnabled,
    },
    // Baked-in defaults so the admin tab can show / reset each prompt.
    promptDefaults: {
      assistant: ASSISTANT_SYSTEM_DEFAULT,
      spontaneous: SPONTANEOUS_SYSTEM_DEFAULT,
      rerank: RERANK_SYSTEM_DEFAULT,
    },
  });
});

/** PUT — merge the AI tuning fields into discord.settings. */
export const PUT = apiHandler(async (req: Request) => {
  await requireAdmin();
  const patch = await parseBody(req, aiSettingsPut);
  const current = await getConfig<Record<string, unknown>>("discord.settings");
  await setConfig("discord.settings", { ...(current ?? {}), ...patch });
  return NextResponse.json({ ok: true });
});

/** POST — add a remembered fact, or ?action=spontaneous to fire a post now. */
export const POST = apiHandler(async (req: Request) => {
  const admin = await requireAdmin();
  if (new URL(req.url).searchParams.get("action") === "spontaneous") {
    const { runSpontaneousPost } = await import("@/lib/discord/spontaneous");
    const result = await runSpontaneousPost();
    return NextResponse.json({ ok: true, result });
  }
  const { fact, subject } = await parseBody(req, memoryCreate);
  const memory = await db.discordMemory.create({
    data: { fact, subject: subject || null, createdById: admin.id },
    select: { id: true, fact: true, subject: true, createdAt: true },
  });
  return NextResponse.json({ memory: { ...memory, createdAt: memory.createdAt.toISOString() } });
});

/** DELETE ?id= — soft-delete a remembered fact. */
export const DELETE = apiHandler(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.discordMemory.updateMany({ where: { id, active: true }, data: { active: false } });
  return NextResponse.json({ ok: true });
});
