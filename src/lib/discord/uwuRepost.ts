import { db } from "@/lib/db";
import { botConfig, discordApi, DISCORD_API } from "@/lib/discord/bot";
import { addOxfordCommas } from "@/lib/discord/oxfordComma";
import { uwuify, type UwuLevel } from "@/lib/discord/uwuify";

const WEBHOOK_NAME = "UDM+ uwu";

export type UwuMessage = {
  id: string;
  channelId: string;
  guildId?: string | null;
  parentChannelId?: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  attachments?: { url: string; name?: string | null; contentType?: string | null }[] | null;
};

const recentlyApplied = new Set<string>();
const memberCache = new Map<string, { name: string; avatar: string | null; at: number }>();
const MEMBER_CACHE_MS = 15_000;

/**
 * If this author is on the uwu and/or Oxford-comma list, webhook-repost the
 * transformed text as them, then delete the original. Oxford runs first so a
 * serial list is corrected before uwu mangles the letters. Posts first so a
 * failed delete leaves a duplicate instead of eating the message.
 */
export async function applyUwuIfNeeded(message: UwuMessage): Promise<void> {
  if (!botConfig().botToken) {
    console.warn("[discord] rewrite skipped: DISCORD_BOT_TOKEN missing");
    return;
  }

  if (recentlyApplied.has(message.id)) return;

  const authorId = String(message.authorId);
  const [uwuTarget, oxfordTarget] = await Promise.all([
    db.discordUwuTarget.findUnique({ where: { discordUserId: authorId } }),
    db.discordOxfordTarget.findUnique({ where: { discordUserId: authorId } }),
  ]);
  if (!uwuTarget && !oxfordTarget) return;

  if (!message.content.trim() && !(message.attachments && message.attachments.length)) {
    console.warn(
      `[discord] rewrite matched ${message.authorId} but content was empty (Message Content intent off?)`
    );
    return;
  }

  recentlyApplied.add(message.id);
  if (recentlyApplied.size > 500) {
    const first = recentlyApplied.values().next().value;
    if (first) recentlyApplied.delete(first);
  }

  const release = () => recentlyApplied.delete(message.id);

  let content = message.content;
  if (oxfordTarget) content = addOxfordCommas(content);
  const level = uwuTarget
    ? ((uwuTarget.level === 2 || uwuTarget.level === 3 ? uwuTarget.level : 1) as UwuLevel)
    : null;
  if (level) content = uwuify(content, level);
  if (content === message.content) {
    release();
    return;
  }
  const profile = await resolveGuildProfile(message);
  const tags = [oxfordTarget ? "oxford" : null, level ? `uwu:${level}` : null].filter(Boolean).join("+");
  console.log(`[discord] rewrite apply user=${message.authorId} ${tags} channel=${message.channelId} as=${profile.name}`);

  const webhookChannelId = message.parentChannelId || message.channelId;
  let hook = await getOrCreateUwuWebhook(webhookChannelId);
  if (!hook) {
    console.error(`[discord] uwu webhook missing for channel ${webhookChannelId}`);
    release();
    return;
  }

  const body = {
    content: content || undefined,
    username: webhookUsername(profile.name),
    avatar_url: profile.avatar || undefined,
    threadId: message.parentChannelId ? message.channelId : null,
    attachments: message.attachments ?? [],
  };
  let posted = await executeWebhook(hook, body);
  if (!posted && body.avatar_url) {
    posted = await executeWebhook(hook, { ...body, avatar_url: undefined });
  }
  if (!posted) {
    hook = await getOrCreateUwuWebhook(webhookChannelId);
    posted = hook ? await executeWebhook(hook, { ...body, avatar_url: undefined }) : false;
  }
  if (!posted) {
    console.error(`[discord] uwu webhook post failed for channel ${webhookChannelId}; falling back to bot post`);
    try {
      await discordApi(`/channels/${message.channelId}/messages`, {
        method: "POST",
        body: { content: content || "*uwu*" },
      });
      posted = true;
    } catch (err) {
      console.error("[discord] uwu bot fallback failed", err);
      release();
      return;
    }
  }

  try {
    await discordApi(`/channels/${message.channelId}/messages/${message.id}`, { method: "DELETE" });
  } catch (err) {
    console.error("[discord] uwu delete failed", err);
  }
}

type GuildMemberPayload = {
  nick?: string | null;
  avatar?: string | null;
  user?: { username?: string; global_name?: string | null; avatar?: string | null };
};

async function resolveGuildProfile(message: UwuMessage): Promise<{ name: string; avatar: string | null }> {
  const fallback = {
    name: message.authorName,
    avatar: message.authorAvatarUrl ?? null,
  };
  const guildId = message.guildId || process.env.DISCORD_GUILD_ID;
  if (!guildId) return fallback;

  const cacheKey = `${guildId}:${message.authorId}`;
  const cached = memberCache.get(cacheKey);
  if (cached && Date.now() - cached.at < MEMBER_CACHE_MS) {
    return { name: cached.name, avatar: cached.avatar };
  }

  try {
    const member = (await discordApi(`/guilds/${guildId}/members/${message.authorId}`, {
      method: "GET",
    }).then((r) => r.json())) as GuildMemberPayload;
    const name =
      member.nick || member.user?.global_name || member.user?.username || message.authorName;
    const avatar = member.avatar
      ? cdnHashUrl(`guilds/${guildId}/users/${message.authorId}/avatars/${member.avatar}`)
      : member.user?.avatar
        ? cdnHashUrl(`avatars/${message.authorId}/${member.user.avatar}`)
        : fallback.avatar;
    const profile = { name, avatar };
    memberCache.set(cacheKey, { ...profile, at: Date.now() });
    return profile;
  } catch (err) {
    console.error("[discord] uwu guild member lookup failed", err);
    return fallback;
  }
}

function cdnHashUrl(pathAndHash: string): string {
  const hash = pathAndHash.slice(pathAndHash.lastIndexOf("/") + 1);
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/${pathAndHash}.${ext}?size=256`;
}

function webhookUsername(name: string): string {
  let u = name.replace(/discord/gi, "d1scord").replace(/clyde/gi, "c1yde").replace(/```/g, "").trim();
  if (!u) u = "member";
  return u.slice(0, 80);
}

async function getOrCreateUwuWebhook(channelId: string): Promise<{ id: string; token: string } | null> {
  const cached = await db.discordChannelState.findUnique({ where: { channelId } });
  if (cached?.uwuWebhookId && cached.uwuWebhookToken) {
    return { id: cached.uwuWebhookId, token: cached.uwuWebhookToken };
  }

  try {
    const listedRaw = await discordApi(`/channels/${channelId}/webhooks`, { method: "GET" }).then((r) =>
      r.json()
    );
    const listed = Array.isArray(listedRaw)
      ? (listedRaw as { id: string; token?: string; name?: string; application_id?: string | null }[])
      : [];
    const { appId } = botConfig();
    const existing = listed.find(
      (w) => w.name === WEBHOOK_NAME && w.token && (!appId || w.application_id === appId)
    );
    if (existing?.token) {
      await saveWebhook(channelId, existing.id, existing.token);
      return { id: existing.id, token: existing.token };
    }
  } catch (err) {
    console.error("[discord] uwu list webhooks failed", err);
  }

  try {
    const created = (await discordApi(`/channels/${channelId}/webhooks`, {
      method: "POST",
      body: { name: WEBHOOK_NAME },
    }).then((r) => r.json())) as { id: string; token?: string };
    if (!created.id || !created.token) return null;
    await saveWebhook(channelId, created.id, created.token);
    return { id: created.id, token: created.token };
  } catch (err) {
    console.error("[discord] uwu create webhook failed", err);
    return null;
  }
}

async function saveWebhook(channelId: string, uwuWebhookId: string, uwuWebhookToken: string) {
  await db.discordChannelState.upsert({
    where: { channelId },
    create: { channelId, uwuWebhookId, uwuWebhookToken },
    update: { uwuWebhookId, uwuWebhookToken },
  });
}

async function executeWebhook(
  hook: { id: string; token: string },
  opts: {
    content?: string;
    username: string;
    avatar_url?: string;
    threadId?: string | null;
    attachments: { url: string; name?: string | null; contentType?: string | null }[];
  }
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    username: opts.username,
    allowed_mentions: { parse: ["users", "roles"] },
  };
  if (opts.content) payload.content = opts.content;
  if (opts.avatar_url) payload.avatar_url = opts.avatar_url;

  const qs = new URLSearchParams({ wait: "true" });
  if (opts.threadId) qs.set("thread_id", opts.threadId);
  const url = `${DISCORD_API}/webhooks/${hook.id}/${hook.token}?${qs}`;

  const files = await loadAttachments(opts.attachments.slice(0, 10));
  let res: Response;
  try {
    if (files.length) {
      const form = new FormData();
      form.append("payload_json", JSON.stringify(payload));
      files.forEach((file, i) => form.append(`files[${i}]`, file.blob, file.name));
      res = await fetch(url, { method: "POST", body: form });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    console.error("[discord] uwu webhook post failed", err);
    return false;
  }

  if (res.status === 404) {
    await db.discordChannelState.updateMany({
      where: { uwuWebhookId: hook.id },
      data: { uwuWebhookId: null, uwuWebhookToken: null },
    });
    return false;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[discord] uwu webhook post → ${res.status}: ${text.slice(0, 300)}`);
    return false;
  }
  return true;
}

async function loadAttachments(
  attachments: { url: string; name?: string | null; contentType?: string | null }[]
): Promise<{ blob: Blob; name: string }[]> {
  const out: { blob: Blob; name: string }[] = [];
  for (const [i, att] of attachments.entries()) {
    try {
      const res = await fetch(att.url);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      const type = att.contentType || res.headers.get("content-type") || "application/octet-stream";
      out.push({
        blob: new Blob([buf], { type }),
        name: att.name || `file-${i}`,
      });
    } catch (err) {
      console.error("[discord] uwu attachment fetch failed", err);
    }
  }
  return out;
}
