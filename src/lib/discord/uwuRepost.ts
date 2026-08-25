import { db } from "@/lib/db";
import { botConfig, discordApi, DISCORD_API } from "@/lib/discord/bot";
import { uwuify, type UwuLevel } from "@/lib/discord/uwuify";

const WEBHOOK_NAME = "UDM+ uwu";

export type UwuMessage = {
  id: string;
  channelId: string;
  parentChannelId?: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  attachments?: { url: string; name?: string | null; contentType?: string | null }[] | null;
};

/**
 * If this author is on the uwu list, webhook-repost the transformed text as
 * them, then delete the original. Posts first so a failed delete leaves a
 * duplicate instead of eating the message.
 */
export async function applyUwuIfNeeded(message: UwuMessage): Promise<void> {
  if (!botConfig().botToken) return;
  if (!message.content.trim() && !(message.attachments && message.attachments.length)) return;

  const target = await db.discordUwuTarget.findUnique({
    where: { discordUserId: message.authorId },
  });
  if (!target) return;

  const level = (target.level === 2 || target.level === 3 ? target.level : 1) as UwuLevel;
  const content = uwuify(message.content, level);

  const webhookChannelId = message.parentChannelId || message.channelId;
  let hook = await getOrCreateUwuWebhook(webhookChannelId);
  if (!hook) return;

  const body = {
    content: content || undefined,
    username: webhookUsername(message.authorName),
    avatar_url: message.authorAvatarUrl || undefined,
    threadId: message.parentChannelId ? message.channelId : null,
    attachments: message.attachments ?? [],
  };
  let posted = await executeWebhook(hook, body);
  if (!posted) {
    hook = await getOrCreateUwuWebhook(webhookChannelId);
    posted = hook ? await executeWebhook(hook, body) : false;
  }
  if (!posted) return;

  try {
    await discordApi(`/channels/${message.channelId}/messages/${message.id}`, { method: "DELETE" });
  } catch (err) {
    console.error("[discord] uwu delete failed", err);
  }
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
