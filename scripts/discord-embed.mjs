/**
 * Build conversation segments from the Discord archive and embed them.
 *
 *   npm run discord:embed:estimate   # rebuild segments, print count + token/cost estimate, embed nothing
 *   npm run discord:embed            # rebuild segments, then embed any new/changed ones (batched)
 *
 * Design (see prisma/migrations/*_discord_archive_segments):
 *   - `messages` is the immutable source of truth (the irreversible Discord
 *     backfill). We never touch it here.
 *   - Segments are a DERIVED layer: consecutive same-channel messages grouped
 *     into bursts, split on a ~45-min idle gap (or size caps). Rebuilding is
 *     cheap and idempotent — segments upsert by id, stale ones are pruned, and
 *     only segments whose content_hash (or model) changed get re-embedded.
 *   - Embeddings go through OpenRouter (OPENROUTER_API_KEY), model
 *     openai/text-embedding-3-small by default. Keep this in sync with
 *     src/lib/discord/embeddings.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const ROOT = join(process.cwd());
loadEnv();

const db = new PrismaClient();
const model = process.env.DISCORD_EMBEDDING_MODEL || "openai/text-embedding-3-small";
const batchSize = Math.min(100, Math.max(1, Number(process.env.DISCORD_EMBED_BATCH_SIZE || 50)));
const estimateOnly = process.argv.includes("--estimate");

// Segmentation knobs — tunable, just rebuild to apply. No re-backfill needed.
const GAP_SECONDS = Number(process.env.DISCORD_SEGMENT_GAP_SECONDS || 2700); // 45 min
const MAX_MSGS = Number(process.env.DISCORD_SEGMENT_MAX_MSGS || 40);
const MAX_CHARS = Number(process.env.DISCORD_SEGMENT_MAX_CHARS || 1500);
const PER_MSG_CHARS = 280; // truncate any one message so it can't dominate a segment
const OPENROUTER_EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

async function main() {
  const built = await rebuildSegments();
  console.log(`[archive] segments: ${built.upserted} current, ${built.pruned} pruned (gap ${GAP_SECONDS}s)`);

  if (estimateOnly) {
    const [row] = await db.$queryRaw`
      SELECT count(*)::int AS count, coalesce(sum(length(content)), 0)::int AS chars
      FROM discord_archive.message_segments
    `;
    const chars = Number(row.chars ?? 0);
    const estimatedTokens = Math.ceil(chars / 4);
    // text-embedding-3-small is ~$0.02 / 1M tokens.
    const estimatedCostUsd = (estimatedTokens / 1_000_000) * 0.02;
    console.log(
      JSON.stringify(
        { segments: row.count, chars, estimatedTokens, estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)), model },
        null,
        2,
      ),
    );
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");

  let total = 0;
  // Loop until nothing needs (re)embedding — new, content-changed, or model-changed segments.
  for (;;) {
    const rows = await db.$queryRaw`
      SELECT s.id, s.content, s.content_hash
      FROM discord_archive.message_segments s
      LEFT JOIN discord_archive.segment_embeddings e ON e.segment_id = s.id
      WHERE length(trim(s.content)) >= 8
        AND (e.segment_id IS NULL OR e.model <> ${model} OR e.content_hash <> s.content_hash)
      ORDER BY s.start_at ASC
      LIMIT ${batchSize}
    `;
    if (!rows.length) break;

    const vectors = await embedTexts(rows.map((r) => r.content));
    // Batch the embedding upserts (one statement, not one per segment).
    const valueRows = [];
    for (let i = 0; i < rows.length; i++) {
      const embedding = vectors[i];
      if (!embedding) continue;
      const vec = `[${embedding.join(",")}]`; // pgvector text literal
      valueRows.push(
        Prisma.sql`(${rows[i].id}, ${model}, ${embedding.length}, ${vec}::vector, ${rows[i].content_hash})`,
      );
    }
    if (valueRows.length) {
      await db.$executeRaw`
        INSERT INTO discord_archive.segment_embeddings (segment_id, model, dimensions, embedding, content_hash)
        VALUES ${Prisma.join(valueRows)}
        ON CONFLICT (segment_id) DO UPDATE SET
          model = EXCLUDED.model,
          dimensions = EXCLUDED.dimensions,
          embedding = EXCLUDED.embedding,
          content_hash = EXCLUDED.content_hash
      `;
    }
    total += valueRows.length;
    console.log(`[archive] embedded ${total} segments so far with ${model}`);
  }

  console.log(total ? `[archive] done — embedded ${total} segments` : "[archive] no segments need embeddings");
}

/**
 * Recompute the derived segment layer from `messages`. Groups each channel's
 * non-deleted, non-bot messages into bursts (idle-gap / size capped), upserts
 * them by id (= first message's snowflake), and prunes segments that no longer
 * exist. Returns counts.
 */
async function rebuildSegments() {
  const messages = await db.$queryRaw`
    SELECT id, channel_id, guild_id, author_name, content, sent_at
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false AND length(trim(content)) >= 1
    ORDER BY channel_id ASC, sent_at ASC, id ASC
  `;

  const segments = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const content = cur.lines.join("\n");
    segments.push({
      id: cur.startId,
      channelId: cur.channelId,
      guildId: cur.guildId,
      startMsgId: cur.startId,
      endMsgId: cur.endId,
      startAt: cur.startAt,
      endAt: cur.endAt,
      messageCount: cur.count,
      content,
      contentHash: sha256(content),
    });
    cur = null;
  };

  for (const m of messages) {
    // Sanitize AFTER slicing: truncating at PER_MSG_CHARS can split an emoji's
    // surrogate pair, so the final oneLine() pass cleans the boundary surrogate.
    const line = oneLine(`${m.author_name}: ${oneLine(m.content).slice(0, PER_MSG_CHARS)}`);
    const sentMs = new Date(m.sent_at).getTime();
    const breaks =
      !cur ||
      cur.channelId !== m.channel_id ||
      sentMs - cur.lastMs > GAP_SECONDS * 1000 ||
      cur.count >= MAX_MSGS ||
      cur.chars + line.length + 1 > MAX_CHARS;

    if (breaks) {
      flush();
      cur = {
        channelId: m.channel_id,
        guildId: m.guild_id,
        startId: m.id,
        endId: m.id,
        startAt: m.sent_at,
        endAt: m.sent_at,
        lastMs: sentMs,
        count: 1,
        chars: line.length,
        lines: [line],
      };
    } else {
      cur.endId = m.id;
      cur.endAt = m.sent_at;
      cur.lastMs = sentMs;
      cur.count += 1;
      cur.chars += line.length + 1;
      cur.lines.push(line);
    }
  }
  flush();

  // Upsert all current segments (batched — one statement per chunk, not per
  // row, which matters a lot over a remote DB), collect their ids, then prune
  // any segment row not in the freshly-computed set (a boundary may have shifted).
  const ids = segments.map((s) => s.id);
  const CHUNK = 500;
  for (let i = 0; i < segments.length; i += CHUNK) {
    const rows = segments.slice(i, i + CHUNK).map(
      (s) => Prisma.sql`(
        ${s.id}, ${s.channelId}, ${s.guildId}, ${s.startMsgId}, ${s.endMsgId},
        ${s.startAt}, ${s.endAt}, ${s.messageCount}, ${s.content}, ${s.contentHash}
      )`,
    );
    await db.$executeRaw`
      INSERT INTO discord_archive.message_segments
        (id, channel_id, guild_id, start_msg_id, end_msg_id, start_at, end_at, message_count, content, content_hash)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (id) DO UPDATE SET
        end_msg_id = EXCLUDED.end_msg_id,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        message_count = EXCLUDED.message_count,
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash
    `;
  }

  // Prune stale segments (boundaries that shifted). Diff in JS and delete only
  // the few removed ids in chunks — `id <> ALL($huge_array)` is pathologically
  // slow at tens of thousands of segments.
  const keep = new Set(ids);
  const existing = await db.$queryRaw`SELECT id FROM discord_archive.message_segments`;
  const stale = existing.map((r) => r.id).filter((id) => !keep.has(id));
  let pruned = 0;
  for (let i = 0; i < stale.length; i += 1000) {
    const chunk = stale.slice(i, i + 1000);
    pruned += await db.$executeRaw`DELETE FROM discord_archive.message_segments WHERE id = ANY(${chunk})`;
  }

  return { upserted: segments.length, pruned };
}

async function embedTexts(texts) {
  const referer = (process.env.AUTH_URL || "https://udm-plus.up.railway.app").replace(/\/$/, "");
  const res = await fetch(OPENROUTER_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "UDM+",
    },
    body: JSON.stringify({ model, input: texts.map((t) => t.slice(0, 8000)) }),
  });
  if (!res.ok) throw new Error(`OpenRouter embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.data ?? []).sort((a, b) => a.index - b.index).map((row) => row.embedding);
}

function oneLine(s) {
  let t = String(s ?? "");
  // Discord content can carry lone UTF-16 surrogates (broken emoji) and control
  // chars; both break the DB driver JSON param serialization in a batch insert.
  if (t.toWellFormed) t = t.toWellFormed(); // lone surrogates -> U+FFFD
  return t.replace(/\s+/g, " ").replace(/\p{C}/gu, "").trim();
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
