import { db } from "@/lib/db";
import { botConfig, discordApi, DISCORD_API } from "@/lib/discord/bot";
import { applyUwuIfNeeded } from "@/lib/discord/uwuRepost";

/**
 * App-side fallback for /uwu live-transform.
 *
 * The rewrite is supposed to ride discord-gateway → /api/discord/ingest, but
 * that sidecar is a separate Railway service: it does not auto-deploy with
 * trivia-trainer, and APP_INGEST_URL is optional there. If ingest never
 * fires, /uwu "works" (the toggle saves) and messages stay untouched.
 *
 * This poller lives in the Next process (which we know deploys) and only
 * runs while someone is actually uwu'd. First sight of a channel records
 * the latest message id and does NOT rewrite history.
 */

const POLL_MS = 2500;
const TEXT_TYPES = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT

let started = false;
let ticking = false;
const cursor = new Map<string, string>();
let channels: { id: string; parentId: string | null }[] = [];
let channelsAt = 0;

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
    const targets = await db.discordUwuTarget.findMany({ select: { discordUserId: true } });
    if (!targets.length) return;
    const wanted = new Set(targets.map((t) => t.discordUserId));

    if (Date.now() - channelsAt > 60_000) {
      channels = await listTextChannels(guildId);
      channelsAt = Date.now();
    }

    for (const ch of channels) {
      await pollChannel(ch, wanted);
    }
  } catch (err) {
    console.error("[discord] uwu poller tick failed", err);
  } finally {
    ticking = false;
  }
}

async function pollChannel(
  ch: { id: string; parentId: string | null },
  wanted: Set<string>
) {
  const after = cursor.get(ch.id);
  if (!after) {
    const latest = await getMessages(ch.id, { limit: 1 });
    if (latest[0]) {
      cursor.set(ch.id, latest[0].id);
      // First sight is normally "don't rewrite history." If the latest
      // message is only a few seconds old (someone testing right after
      // deploy), transform it — otherwise it looks like the poller is dead.
      if (Date.now() - snowflakeMs(latest[0].id) < 20_000) {
        await maybeApply(ch, latest[0], wanted);
      }
    }
    return;
  }

  const batch = await getMessages(ch.id, { after, limit: 50 });
  if (!batch.length) return;
  cursor.set(ch.id, batch[0].id);

  for (const msg of [...batch].reverse()) {
    await maybeApply(ch, msg, wanted);
  }
}

async function maybeApply(
  ch: { id: string; parentId: string | null },
  msg: ApiMessage,
  wanted: Set<string>
) {
  const author = msg.author;
  const authorId = author?.id;
  if (!author || !authorId || author.bot || msg.webhook_id) return;
  if (!wanted.has(authorId)) return;
  console.log(`[discord] uwu poller hit user=${authorId} channel=${ch.id} msg=${msg.id}`);
  await applyUwuIfNeeded({
    id: msg.id,
    channelId: ch.id,
    parentChannelId: ch.parentId,
    authorId,
    authorName: msg.member?.nick || author.global_name || author.username || "member",
    authorAvatarUrl: avatarUrl(author),
    content: msg.content ?? "",
    attachments: (msg.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.filename ?? null,
      contentType: a.content_type ?? null,
    })),
  }).catch((err) => console.error("[discord] uwu poller apply failed", err));
}

async function listTextChannels(guildId: string): Promise<{ id: string; parentId: string | null }[]> {
  try {
    const rows = (await discordApi(`/guilds/${guildId}/channels`, { method: "GET" }).then((r) =>
      r.json()
    )) as { id: string; type: number; parent_id?: string | null }[];
    if (!Array.isArray(rows)) return [];
    const text: { id: string; parentId: string | null }[] = rows
      .filter((c) => TEXT_TYPES.has(c.type))
      .map((c) => ({ id: c.id, parentId: null }));
    try {
      const active = (await discordApi(`/guilds/${guildId}/threads/active`, { method: "GET" }).then((r) =>
        r.json()
      )) as { threads?: { id: string; parent_id?: string | null }[] };
      for (const t of active.threads ?? []) {
        text.push({ id: t.id, parentId: t.parent_id ?? null });
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
  content?: string;
  webhook_id?: string;
  author?: { id: string; username?: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  member?: { nick?: string | null };
  attachments?: { url: string; filename?: string; content_type?: string | null }[];
};

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

function avatarUrl(user: { id: string; avatar?: string | null } | undefined): string | null {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}

function snowflakeMs(id: string): number {
  try {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
  } catch {
    return 0;
  }
}
