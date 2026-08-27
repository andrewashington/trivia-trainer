import { db } from "@/lib/db";
import { botConfig, discordApi, DISCORD_API } from "@/lib/discord/bot";
import { applyUwuIfNeeded } from "@/lib/discord/uwuRepost";

/**
 * App-side fallback for live message rewrites (/uwu, /oxford, /chandler-mode).
 *
 * The rewrite is supposed to ride discord-gateway → /api/discord/ingest, but
 * that sidecar is a separate Railway service: it does not auto-deploy with
 * trivia-trainer, and APP_INGEST_URL is optional there. If ingest never
 * fires, the toggle saves and messages stay untouched.
 *
 * This poller lives in the Next process (which we know deploys) and only
 * runs while someone is actually on a rewrite list. First sight of a channel
 * records the latest message id and does NOT rewrite history.
 *
 * Speed: list channels each tick (cheap) and only GET messages on channels
 * whose last_message_id moved — polling every text channel was the lag.
 */

const POLL_MS = 1000;
const FETCH_CONCURRENCY = 6;
const TEXT_TYPES = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT

type ChannelRef = { id: string; parentId: string | null; lastMessageId: string | null };

let started = false;
let ticking = false;
const cursor = new Map<string, string>();

export function startUwuPoller() {
  if (started) return;
  const { botToken } = botConfig();
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) {
    console.warn("[discord] uwu poller disabled (need DISCORD_BOT_TOKEN + DISCORD_GUILD_ID)");
    return;
  }
  started = true;
  console.log("[discord] uwu poller started");
  void tick(guildId);
  setInterval(() => void tick(guildId), POLL_MS).unref?.();
}

async function tick(guildId: string) {
  if (ticking) return;
  ticking = true;
  try {
    const [uwuTargets, oxfordTargets, chandlerTargets] = await Promise.all([
      db.discordUwuTarget.findMany({ select: { discordUserId: true } }),
      db.discordOxfordTarget.findMany({ select: { discordUserId: true } }),
      db.discordChandlerTarget.findMany({ select: { discordUserId: true } }),
    ]);
    if (!uwuTargets.length && !oxfordTargets.length && !chandlerTargets.length) return;
    const wanted = new Set([
      ...uwuTargets.map((t) => t.discordUserId),
      ...oxfordTargets.map((t) => t.discordUserId),
      ...chandlerTargets.map((t) => t.discordUserId),
    ]);
    const channels = await listTextChannels(guildId);
    const dirty: ChannelRef[] = [];

    for (const ch of channels) {
      const after = cursor.get(ch.id);
      if (!after) {
        if (ch.lastMessageId) cursor.set(ch.id, ch.lastMessageId);
        continue;
      }
      if (!ch.lastMessageId || ch.lastMessageId === after) continue;
      dirty.push(ch);
    }

    await mapPool(dirty, FETCH_CONCURRENCY, (ch) => pollChannel(ch, wanted, guildId));
  } catch (err) {
    console.error("[discord] uwu poller tick failed", err);
  } finally {
    ticking = false;
  }
}

async function pollChannel(ch: ChannelRef, wanted: Set<string>, guildId: string) {
  const after = cursor.get(ch.id);
  if (!after) return;

  const batch = await getMessages(ch.id, { after, limit: 50 });
  if (!batch.length) {
    if (ch.lastMessageId) cursor.set(ch.id, ch.lastMessageId);
    return;
  }
  cursor.set(ch.id, batch[0].id);

  for (const msg of [...batch].reverse()) {
    await maybeApply(ch, msg, wanted, guildId);
  }
}

async function maybeApply(ch: ChannelRef, msg: ApiMessage, wanted: Set<string>, guildId: string) {
  const author = msg.author;
  const authorId = author?.id;
  if (!author || !authorId || isAppMessage(msg, author)) return;
  if (!wanted.has(authorId)) return;
  console.log(`[discord] rewrite poller hit user=${authorId} channel=${ch.id} msg=${msg.id}`);
  await applyUwuIfNeeded({
    id: msg.id,
    channelId: ch.id,
    guildId,
    parentChannelId: ch.parentId,
    authorId,
    authorName: author.global_name || author.username || "member",
    authorAvatarUrl: author.avatar ? cdnUserAvatar(author.id, author.avatar) : null,
    content: msg.content ?? "",
    attachments: (msg.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.filename ?? null,
      contentType: a.content_type ?? null,
    })),
  }).catch((err) => console.error("[discord] uwu poller apply failed", err));
}

async function listTextChannels(guildId: string): Promise<ChannelRef[]> {
  try {
    const rows = (await discordApi(`/guilds/${guildId}/channels`, { method: "GET" }).then((r) =>
      r.json()
    )) as { id: string; type: number; last_message_id?: string | null }[];
    if (!Array.isArray(rows)) return [];
    const text: ChannelRef[] = rows
      .filter((c) => TEXT_TYPES.has(c.type))
      .map((c) => ({ id: c.id, parentId: null, lastMessageId: c.last_message_id ?? null }));
    try {
      const active = (await discordApi(`/guilds/${guildId}/threads/active`, { method: "GET" }).then((r) =>
        r.json()
      )) as { threads?: { id: string; parent_id?: string | null; last_message_id?: string | null }[] };
      for (const t of active.threads ?? []) {
        text.push({ id: t.id, parentId: t.parent_id ?? null, lastMessageId: t.last_message_id ?? null });
      }
    } catch {
      /* threads are optional — text channels still get polled */
    }
    return text;
  } catch (err) {
    console.error("[discord] uwu poller list channels failed", err);
    return [];
  }
}

type ApiMessage = {
  id: string;
  type?: number;
  content?: string;
  webhook_id?: string;
  application_id?: string;
  author?: { id: string; username?: string; global_name?: string | null; avatar?: string | null; bot?: boolean; system?: boolean };
  attachments?: { url: string; filename?: string; content_type?: string | null }[];
};

const HUMAN_TYPES = new Set([0, 19]); // DEFAULT, REPLY

function isAppMessage(
  msg: ApiMessage,
  author: NonNullable<ApiMessage["author"]>
): boolean {
  return Boolean(
    author.bot ||
      author.system ||
      msg.webhook_id ||
      msg.application_id ||
      (msg.type != null && !HUMAN_TYPES.has(msg.type))
  );
}

async function getMessages(
  channelId: string,
  opts: { after?: string; limit: number }
): Promise<ApiMessage[]> {
  const { botToken } = botConfig();
  if (!botToken) return [];
  const qs = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.after) qs.set("after", opts.after);
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${qs}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (res.status === 403 || res.status === 404) return [];
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[discord] uwu poller messages ${channelId} → ${res.status}: ${text.slice(0, 160)}`);
      return [];
    }
    const rows = (await res.json()) as ApiMessage[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("[discord] uwu poller messages failed", err);
    return [];
  }
}

function cdnUserAvatar(userId: string, hash: string): string {
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=256`;
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  if (!items.length) return;
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await fn(item);
      }
    })
  );
}
