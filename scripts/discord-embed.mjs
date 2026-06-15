/**
 * Estimate or run Discord archive embeddings.
 *
 *   npm run discord:embed:estimate
 *   npm run discord:embed
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ROOT = join(process.cwd());
loadEnv();

const db = new PrismaClient();
const model = process.env.DISCORD_EMBEDDING_MODEL || "text-embedding-3-small";
const batchSize = Math.min(100, Math.max(1, Number(process.env.DISCORD_EMBED_BATCH_SIZE || 50)));
const estimateOnly = process.argv.includes("--estimate");

async function main() {
  if (estimateOnly) {
    const [row] = await db.$queryRaw`
      SELECT count(*)::int AS count, coalesce(sum(length(content)), 0)::int AS chars
      FROM discord_archive.messages
      WHERE deleted_at IS NULL AND is_bot = false AND length(trim(content)) >= 8
    `;
    const estimatedTokens = Math.ceil(Number(row.chars ?? 0) / 4);
    console.log(JSON.stringify({ messages: row.count, chars: row.chars, estimatedTokens, model }, null, 2));
    return;
  }

  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const rows = await db.$queryRaw`
    SELECT m.id, m.content
    FROM discord_archive.messages m
    LEFT JOIN discord_archive.message_embeddings e ON e.message_id = m.id
    WHERE m.deleted_at IS NULL
      AND m.is_bot = false
      AND length(trim(m.content)) >= 8
      AND (e.message_id IS NULL OR e.model <> ${model})
    ORDER BY m.sent_at ASC
    LIMIT ${batchSize}
  `;
  if (!rows.length) {
    console.log("[archive] no messages need embeddings");
    return;
  }

  const vectors = await embedTexts(rows.map((r) => r.content));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const embedding = vectors[i];
    if (!embedding) continue;
    await db.$executeRaw`
      INSERT INTO discord_archive.message_embeddings (message_id, model, dimensions, embedding, content_hash)
      VALUES (${row.id}, ${model}, ${embedding.length}, ${embedding}, ${contentHash(row.content)})
      ON CONFLICT (message_id) DO UPDATE SET
        model = EXCLUDED.model,
        dimensions = EXCLUDED.dimensions,
        embedding = EXCLUDED.embedding,
        content_hash = EXCLUDED.content_hash
    `;
  }
  console.log(`[archive] embedded ${vectors.length} messages with ${model}`);
}

async function embedTexts(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts.map((t) => t.slice(0, 8000)) }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.data ?? []).sort((a, b) => a.index - b.index).map((row) => row.embedding);
}

function contentHash(content) {
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
