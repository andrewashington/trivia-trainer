import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type ArchiveAttachment = {
  url: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
};

export type ArchiveMessageInput = {
  id: string;
  channelId: string;
  guildId?: string | null;
  channelName?: string | null;
  channelKind?: string | null;
  authorId: string;
  authorName: string;
  isBot?: boolean;
  content?: string;
  replyToId?: string | null;
  attachments?: ArchiveAttachment[] | null;
  hasEmbed?: boolean;
  sentAt: Date;
  editedAt?: Date | null;
};

export type ArchiveSearchHit = {
  messageId: string;
  channelId: string;
  authorId: string;
  author: string;
  userId: string | null;
  text: string;
  at: string;
  score: number;
  source: "keyword" | "semantic";
};

export function archiveEnabled(): boolean {
  return process.env.DISCORD_ARCHIVE_DISABLED !== "true";
}

export function embeddingsEnabled(): boolean {
  return process.env.DISCORD_EMBEDDINGS_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
}

export function verifyGatewaySignature(raw: string, provided: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function resolveUserId(discordUserId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { discordUserId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function upsertArchiveChannel(input: {
  id: string;
  guildId?: string | null;
  name?: string | null;
  kind?: string | null;
  archived?: boolean;
}) {
  await db.$executeRaw`
    INSERT INTO discord_archive.channels (id, guild_id, name, kind, archived)
    VALUES (${input.id}, ${input.guildId ?? null}, ${input.name ?? null}, ${input.kind ?? null}, ${input.archived ?? false})
    ON CONFLICT (id) DO UPDATE SET
      guild_id = COALESCE(EXCLUDED.guild_id, discord_archive.channels.guild_id),
      name = COALESCE(EXCLUDED.name, discord_archive.channels.name),
      kind = COALESCE(EXCLUDED.kind, discord_archive.channels.kind),
      archived = EXCLUDED.archived
  `;
}

export async function upsertArchiveMessage(input: ArchiveMessageInput) {
  await upsertArchiveChannel({
    id: input.channelId,
    guildId: input.guildId ?? null,
    name: input.channelName ?? null,
    kind: input.channelKind ?? null,
  });

  const userId = await resolveUserId(input.authorId);
  const attachments = input.attachments ? (input.attachments as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;

  await db.$executeRaw`
    INSERT INTO discord_archive.messages (
      id, channel_id, guild_id, author_id, author_name, user_id, is_bot,
      content, reply_to_id, attachments, has_embed, sent_at, edited_at
    )
    VALUES (
      ${input.id}, ${input.channelId}, ${input.guildId ?? null}, ${input.authorId},
      ${input.authorName}, ${userId}, ${input.isBot ?? false}, ${input.content ?? ""},
      ${input.replyToId ?? null}, ${attachments}, ${input.hasEmbed ?? false},
      ${input.sentAt}, ${input.editedAt ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      guild_id = EXCLUDED.guild_id,
      author_id = EXCLUDED.author_id,
      author_name = EXCLUDED.author_name,
      user_id = COALESCE(EXCLUDED.user_id, discord_archive.messages.user_id),
      is_bot = EXCLUDED.is_bot,
      content = EXCLUDED.content,
      reply_to_id = EXCLUDED.reply_to_id,
      attachments = EXCLUDED.attachments,
      has_embed = EXCLUDED.has_embed,
      sent_at = EXCLUDED.sent_at,
      edited_at = COALESCE(EXCLUDED.edited_at, discord_archive.messages.edited_at),
      deleted_at = NULL
  `;
}

export async function updateArchiveMessage(input: {
  id: string;
  channelId?: string | null;
  guildId?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  isBot?: boolean;
  content?: string;
  editedAt?: Date | null;
  sentAt?: Date | null;
}) {
  const userId = input.authorId ? await resolveUserId(input.authorId) : null;
  await db.$executeRaw`
    UPDATE discord_archive.messages
    SET
      channel_id = COALESCE(${input.channelId ?? null}, channel_id),
      guild_id = COALESCE(${input.guildId ?? null}, guild_id),
      author_id = COALESCE(${input.authorId ?? null}, author_id),
      author_name = COALESCE(${input.authorName ?? null}, author_name),
      user_id = COALESCE(${userId}, user_id),
      is_bot = COALESCE(${input.isBot ?? null}, is_bot),
      content = COALESCE(${input.content ?? null}, content),
      edited_at = COALESCE(${input.editedAt ?? null}, edited_at),
      sent_at = COALESCE(${input.sentAt ?? null}, sent_at)
    WHERE id = ${input.id}
  `;
}

export async function softDeleteArchiveMessage(id: string, at = new Date()) {
  await db.$executeRaw`
    UPDATE discord_archive.messages
    SET deleted_at = COALESCE(deleted_at, ${at})
    WHERE id = ${id}
  `;
}

export async function addArchiveReaction(input: {
  messageId: string;
  emoji: string;
  authorId: string;
  at?: Date;
}) {
  const userId = await resolveUserId(input.authorId);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO discord_archive.reactions (message_id, emoji, author_id, user_id, at)
      VALUES (${input.messageId}, ${input.emoji}, ${input.authorId}, ${userId}, ${input.at ?? new Date()})
      ON CONFLICT (message_id, emoji, author_id) DO NOTHING
    `;
    await tx.$executeRaw`
      UPDATE discord_archive.messages m
      SET reaction_count = (
        SELECT count(*)::int FROM discord_archive.reactions r WHERE r.message_id = m.id
      )
      WHERE m.id = ${input.messageId}
    `;
  });
}

export async function removeArchiveReaction(input: { messageId: string; emoji: string; authorId: string }) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM discord_archive.reactions
      WHERE message_id = ${input.messageId} AND emoji = ${input.emoji} AND author_id = ${input.authorId}
    `;
    await tx.$executeRaw`
      UPDATE discord_archive.messages m
      SET reaction_count = (
        SELECT count(*)::int FROM discord_archive.reactions r WHERE r.message_id = m.id
      )
      WHERE m.id = ${input.messageId}
    `;
  });
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function messagesNeedingEmbeddings(limit: number, model: string) {
  return db.$queryRaw<{ id: string; content: string }[]>`
    SELECT m.id, m.content
    FROM discord_archive.messages m
    LEFT JOIN discord_archive.message_embeddings e ON e.message_id = m.id
    WHERE m.deleted_at IS NULL
      AND m.is_bot = false
      AND length(trim(m.content)) >= 8
      AND (e.message_id IS NULL OR e.model <> ${model})
    ORDER BY m.sent_at ASC
    LIMIT ${limit}
  `;
}

export async function upsertMessageEmbedding(input: {
  messageId: string;
  model: string;
  embedding: number[];
  content: string;
}) {
  await db.$executeRaw`
    INSERT INTO discord_archive.message_embeddings (message_id, model, dimensions, embedding, content_hash)
    VALUES (${input.messageId}, ${input.model}, ${input.embedding.length}, ${input.embedding}, ${contentHash(input.content)})
    ON CONFLICT (message_id) DO UPDATE SET
      model = EXCLUDED.model,
      dimensions = EXCLUDED.dimensions,
      embedding = EXCLUDED.embedding,
      content_hash = EXCLUDED.content_hash
  `;
}

export async function searchArchiveMessages(opts: {
  query: string;
  queryEmbedding?: number[];
  channelId?: string;
  authorId?: string;
  after?: Date;
  before?: Date;
  limit?: number;
}): Promise<ArchiveSearchHit[]> {
  const query = opts.query.trim();
  if (!query) return [];
  const limit = Math.min(30, Math.max(1, opts.limit ?? 12));
  const channelId = opts.channelId ?? null;
  const authorId = opts.authorId ?? null;
  const after = opts.after ?? null;
  const before = opts.before ?? null;

  const keywordHits = await db.$queryRaw<ArchiveSearchHit[]>`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS tsq)
    SELECT
      m.id AS "messageId",
      m.channel_id AS "channelId",
      m.author_id AS "authorId",
      m.author_name AS author,
      m.user_id AS "userId",
      m.content AS text,
      m.sent_at::text AS at,
      ts_rank(m.content_tsv, q.tsq)::double precision AS score,
      'keyword'::text AS source
    FROM discord_archive.messages m, q
    WHERE m.deleted_at IS NULL
      AND m.is_bot = false
      AND m.content_tsv @@ q.tsq
      AND (${channelId}::text IS NULL OR m.channel_id = ${channelId})
      AND (${authorId}::text IS NULL OR m.author_id = ${authorId})
      AND (${after}::timestamptz IS NULL OR m.sent_at >= ${after})
      AND (${before}::timestamptz IS NULL OR m.sent_at <= ${before})
    ORDER BY score DESC, m.sent_at DESC
    LIMIT ${limit}
  `;

  let semanticHits: ArchiveSearchHit[] = [];
  if (opts.queryEmbedding?.length) {
    semanticHits = await db.$queryRaw<ArchiveSearchHit[]>`
      SELECT
        m.id AS "messageId",
        m.channel_id AS "channelId",
        m.author_id AS "authorId",
        m.author_name AS author,
        m.user_id AS "userId",
        m.content AS text,
        m.sent_at::text AS at,
        discord_archive.cosine_similarity(e.embedding, ${opts.queryEmbedding}) AS score,
        'semantic'::text AS source
      FROM discord_archive.message_embeddings e
      JOIN discord_archive.messages m ON m.id = e.message_id
      WHERE m.deleted_at IS NULL
        AND m.is_bot = false
        AND (${channelId}::text IS NULL OR m.channel_id = ${channelId})
        AND (${authorId}::text IS NULL OR m.author_id = ${authorId})
        AND (${after}::timestamptz IS NULL OR m.sent_at >= ${after})
        AND (${before}::timestamptz IS NULL OR m.sent_at <= ${before})
      ORDER BY score DESC, m.sent_at DESC
      LIMIT ${limit}
    `;
  }

  const merged = new Map<string, ArchiveSearchHit>();
  for (const hit of [...semanticHits, ...keywordHits]) {
    const existing = merged.get(hit.messageId);
    if (!existing || hit.score > existing.score) merged.set(hit.messageId, hit);
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score || Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
