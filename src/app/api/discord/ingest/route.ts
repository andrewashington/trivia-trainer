import { NextResponse } from "next/server";
import {
  addArchiveReaction,
  archiveEnabled,
  softDeleteArchiveMessage,
  removeArchiveReaction,
  updateArchiveMessage,
  upsertArchiveMessage,
  verifyGatewaySignature,
  type ArchiveAttachment,
} from "@/lib/discord/archive";

export const dynamic = "force-dynamic";

type IngestPayload =
  | { kind: "create" | "update"; message?: unknown }
  | { kind: "delete"; id?: unknown; channelId?: unknown; deletedAt?: unknown }
  | {
      kind: "reaction";
      op?: unknown;
      messageId?: unknown;
      emoji?: unknown;
      userId?: unknown;
      at?: unknown;
    };

export async function POST(req: Request) {
  const secret = process.env.DISCORD_GATEWAY_SECRET;
  if (!secret || !archiveEnabled()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifyGatewaySignature(raw, req.headers.get("x-udm-signature") ?? "", secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: IngestPayload | IngestPayload[];
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const events = Array.isArray(payload) ? payload : [payload];
  void Promise.all(events.map((event) => handleEvent(event))).catch((err) =>
    console.error("[discord] archive ingest failed", err)
  );
  return NextResponse.json({ ok: true });
}

async function handleEvent(payload: IngestPayload) {
  if (payload.kind === "create" || payload.kind === "update") {
    const message = parseMessage(payload.message);
    if (!message) return;
    if (payload.kind === "create") {
      await upsertArchiveMessage(message);
    } else {
      await updateArchiveMessage({
        id: message.id,
        channelId: message.channelId,
        guildId: message.guildId,
        authorId: message.authorId,
        authorName: message.authorName,
        isBot: message.isBot,
        content: message.content,
        editedAt: message.editedAt ?? new Date(),
        sentAt: message.sentAt,
      });
    }
    return;
  }

  if (payload.kind === "delete") {
    const id = typeof payload.id === "string" ? payload.id : null;
    if (id) await softDeleteArchiveMessage(id, parseDate(payload.deletedAt) ?? new Date());
    return;
  }

  if (payload.kind === "reaction") {
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    const emoji = typeof payload.emoji === "string" ? payload.emoji : null;
    const authorId = typeof payload.userId === "string" ? payload.userId : null;
    if (!messageId || !emoji || !authorId) return;
    if (payload.op === "remove") {
      await removeArchiveReaction({ messageId, emoji, authorId });
    } else {
      await addArchiveReaction({ messageId, emoji, authorId, at: parseDate(payload.at) ?? new Date() });
    }
  }
}

function parseMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const msg = value as Record<string, unknown>;
  const id = typeof msg.id === "string" ? msg.id : null;
  const channelId = typeof msg.channelId === "string" ? msg.channelId : null;
  const authorId = typeof msg.authorId === "string" ? msg.authorId : null;
  const sentAt = parseDate(msg.sentAt);
  if (!id || !channelId || !authorId || !sentAt) return null;

  return {
    id,
    channelId,
    guildId: typeof msg.guildId === "string" ? msg.guildId : null,
    channelName: typeof msg.channelName === "string" ? msg.channelName : null,
    channelKind: typeof msg.channelKind === "string" ? msg.channelKind : null,
    authorId,
    authorName: typeof msg.authorName === "string" ? msg.authorName : "unknown",
    isBot: msg.isBot === true,
    content: typeof msg.content === "string" ? msg.content : "",
    replyToId: typeof msg.replyToId === "string" ? msg.replyToId : null,
    attachments: parseAttachments(msg.attachments),
    hasEmbed: msg.hasEmbed === true,
    sentAt,
    editedAt: parseDate(msg.editedAt),
  };
}

function parseAttachments(value: unknown): ArchiveAttachment[] | null {
  if (!Array.isArray(value)) return null;
  const out: ArchiveAttachment[] = [];
  for (const item of value) {
      if (!item || typeof item !== "object") return null;
      const a = item as Record<string, unknown>;
      const url = typeof a.url === "string" ? a.url : null;
      if (!url) continue;
      out.push({
        url,
        name: typeof a.name === "string" ? a.name : null,
        contentType: typeof a.contentType === "string" ? a.contentType : null,
        size: typeof a.size === "number" ? a.size : null,
      });
  }
  return out;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
