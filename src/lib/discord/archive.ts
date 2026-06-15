import { createHmac, timingSafeEqual } from "node:crypto";
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

// A search hit is a conversation SEGMENT (a burst of consecutive messages), not
// a single message — that's the unit that actually carries meaning. `text` is
// the whole burst, already formatted as "author: line" rows.
export type ArchiveSearchHit = {
  segmentId: string;
  channelId: string;
  channelName: string | null;
  guildId: string | null;
  text: string;
  at: string;
  messageCount: number;
  score: number;
  source: "keyword" | "semantic";
};

export function archiveEnabled(): boolean {
  return process.env.DISCORD_ARCHIVE_DISABLED !== "true";
}

export function embeddingsEnabled(): boolean {
  return process.env.DISCORD_EMBEDDINGS_ENABLED === "true" && !!process.env.OPENROUTER_API_KEY;
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

// One row out of the segment search SQL, before neighbor expansion.
type RawSegmentHit = {
  segmentId: string;
  channelId: string;
  channelName: string | null;
  guildId: string | null;
  text: string;
  at: string;
  endAt: string;
  messageCount: number;
  score: number;
  source: "keyword" | "semantic";
};

const EXPAND_WINDOW_HOURS = 4; // pull neighbor segments within ±this of a hit
const EXPAND_EACH_SIDE = 2; // up to this many neighbors before + after a hit
const EXPAND_CHAR_BUDGET = 3200; // cap stitched text per hit
const RRF_K = 60; // Reciprocal Rank Fusion constant (standard default)
const MMR_LAMBDA = 0.7; // MMR: weight on relevance vs. diversity (1 = pure relevance)

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Maximal Marginal Relevance. Friend-group chat is full of near-duplicate
 * bursts ("lol same" ×8); pure relevance returns eight angles on one moment.
 * MMR greedily picks the next candidate that's relevant AND different from
 * what's already chosen, so the bot gets distinct moments. Diversity is
 * lexical (token Jaccard over segment text) — cheap, no vectors to refetch.
 */
function mmrSelect(candidates: { hit: RawSegmentHit; rrf: number }[], k: number): RawSegmentHit[] {
  if (candidates.length <= 1) return candidates.map((c) => c.hit);
  const maxRrf = Math.max(...candidates.map((c) => c.rrf)) || 1;
  const pool = candidates.map((c) => ({ hit: c.hit, rel: c.rrf / maxRrf, tok: tokenize(c.hit.text) }));
  const chosen: typeof pool = [];
  while (pool.length && chosen.length < k) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      let maxSim = 0;
      for (const c of chosen) maxSim = Math.max(maxSim, jaccard(pool[i].tok, c.tok));
      const score = MMR_LAMBDA * pool[i].rel - (1 - MMR_LAMBDA) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    chosen.push(pool.splice(bestIdx, 1)[0]);
  }
  return chosen.map((c) => c.hit);
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

  // Keyword search over segment content (full burst), not single messages.
  const keywordHits = await db.$queryRaw<RawSegmentHit[]>`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS tsq)
    SELECT
      s.id AS "segmentId",
      s.channel_id AS "channelId",
      c.name AS "channelName",
      s.guild_id AS "guildId",
      s.content AS text,
      s.start_at::text AS at,
      s.end_at::text AS "endAt",
      s.message_count AS "messageCount",
      ts_rank(s.content_tsv, q.tsq)::double precision AS score,
      'keyword'::text AS source
    FROM discord_archive.message_segments s
    CROSS JOIN q
    LEFT JOIN discord_archive.channels c ON c.id = s.channel_id
    WHERE s.content_tsv @@ q.tsq
      AND (${channelId}::text IS NULL OR s.channel_id = ${channelId})
      AND (${after}::timestamptz IS NULL OR s.end_at >= ${after})
      AND (${before}::timestamptz IS NULL OR s.start_at <= ${before})
      AND (${authorId}::text IS NULL OR EXISTS (
        SELECT 1 FROM discord_archive.messages m
        WHERE m.channel_id = s.channel_id AND m.author_id = ${authorId}
          AND m.sent_at BETWEEN s.start_at AND s.end_at
      ))
    ORDER BY score DESC, s.start_at DESC
    LIMIT ${limit}
  `;

  let semanticHits: RawSegmentHit[] = [];
  if (opts.queryEmbedding?.length) {
    // pgvector: `<=>` is cosine distance (0 = identical), so similarity = 1 - dist.
    // Order by raw distance ascending so the HNSW index can serve the query.
    const vec = `[${opts.queryEmbedding.join(",")}]`;
    semanticHits = await db.$queryRaw<RawSegmentHit[]>`
      SELECT
        s.id AS "segmentId",
        s.channel_id AS "channelId",
        c.name AS "channelName",
        s.guild_id AS "guildId",
        s.content AS text,
        s.start_at::text AS at,
        s.end_at::text AS "endAt",
        s.message_count AS "messageCount",
        (1 - (e.embedding <=> ${vec}::vector))::double precision AS score,
        'semantic'::text AS source
      FROM discord_archive.segment_embeddings e
      JOIN discord_archive.message_segments s ON s.id = e.segment_id
      LEFT JOIN discord_archive.channels c ON c.id = s.channel_id
      WHERE (${channelId}::text IS NULL OR s.channel_id = ${channelId})
        AND (${after}::timestamptz IS NULL OR s.end_at >= ${after})
        AND (${before}::timestamptz IS NULL OR s.start_at <= ${before})
        AND (${authorId}::text IS NULL OR EXISTS (
          SELECT 1 FROM discord_archive.messages m
          WHERE m.channel_id = s.channel_id AND m.author_id = ${authorId}
            AND m.sent_at BETWEEN s.start_at AND s.end_at
        ))
      ORDER BY e.embedding <=> ${vec}::vector
      LIMIT ${limit}
    `;
  }

  // Reciprocal Rank Fusion: keyword ts_rank and semantic cosine scores live on
  // different scales, so we fuse by *rank* instead of raw score — each list
  // contributes 1/(k + rank), summed per segment. A segment that ranks high in
  // both lists wins; one strong signal still surfaces a hit.
  const fused = new Map<string, { hit: RawSegmentHit; rrf: number }>();
  const fuse = (list: RawSegmentHit[]) => {
    list.forEach((hit, i) => {
      const inc = 1 / (RRF_K + i);
      const existing = fused.get(hit.segmentId);
      if (existing) existing.rrf += inc;
      else fused.set(hit.segmentId, { hit, rrf: inc });
    });
  };
  fuse(semanticHits);
  fuse(keywordHits);

  // Order by fused relevance, then re-select with MMR so the returned set is
  // relevant AND diverse (no eight-near-identical-bursts).
  const byRelevance = [...fused.values()].sort(
    (a, b) => b.rrf - a.rrf || Date.parse(b.hit.at) - Date.parse(a.hit.at),
  );
  const ranked = mmrSelect(byRelevance, limit);

  return expandHits(ranked);
}

/**
 * Read-time neighbor expansion. We deliberately embed tight, topically-focused
 * bursts (clean vectors → good recall), then stitch each hit back together with
 * its surrounding same-channel segments here — so an async conversation that
 * sprawled across a workday comes back whole, without muddying the embedding.
 * Hits whose expanded windows overlap collapse into one (highest score wins).
 */
async function expandHits(hits: RawSegmentHit[]): Promise<ArchiveSearchHit[]> {
  if (!hits.length) return [];

  const out: ArchiveSearchHit[] = [];
  const usedSegments = new Set<string>();

  for (const hit of hits) {
    if (usedSegments.has(hit.segmentId)) continue; // already swallowed by a stronger hit's window

    const neighbors = await db.$queryRaw<{ segmentId: string; text: string; at: string }[]>`
      (
        SELECT s.id AS "segmentId", s.content AS text, s.start_at::text AS at
        FROM discord_archive.message_segments s
        WHERE s.channel_id = ${hit.channelId}
          AND s.start_at < ${hit.at}::timestamptz
          AND s.end_at >= ${hit.at}::timestamptz - (${EXPAND_WINDOW_HOURS} || ' hours')::interval
        ORDER BY s.start_at DESC
        LIMIT ${EXPAND_EACH_SIDE}
      )
      UNION ALL
      (
        SELECT s.id AS "segmentId", s.content AS text, s.start_at::text AS at
        FROM discord_archive.message_segments s
        WHERE s.channel_id = ${hit.channelId}
          AND s.start_at > ${hit.at}::timestamptz
          AND s.start_at <= ${hit.endAt}::timestamptz + (${EXPAND_WINDOW_HOURS} || ' hours')::interval
        ORDER BY s.start_at ASC
        LIMIT ${EXPAND_EACH_SIDE}
      )
    `;

    const pieces = [{ segmentId: hit.segmentId, text: hit.text, at: hit.at }, ...neighbors]
      .filter((p) => !usedSegments.has(p.segmentId))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    let text = "";
    let count = 0;
    for (const p of pieces) {
      const next = text ? `${text}\n— — —\n${p.text}` : p.text;
      if (next.length > EXPAND_CHAR_BUDGET && text) break;
      text = next;
      count++;
      usedSegments.add(p.segmentId);
    }

    out.push({
      segmentId: hit.segmentId,
      channelId: hit.channelId,
      channelName: hit.channelName,
      guildId: hit.guildId,
      text,
      at: hit.at,
      messageCount: hit.messageCount,
      score: hit.score,
      source: hit.source,
    });
    void count;
  }

  return out;
}
