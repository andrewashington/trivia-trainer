/**
 * Retrieval eval — measures whether the archive search actually surfaces the
 * right conversations. Runs each case through the REAL search path
 * (searchArchiveMessages + embedQuery, optionally rerankHits), then checks that
 * the expected anchor terms appear in the returned segments.
 *
 *   npm run discord:eval            # retrieval only
 *   npm run discord:eval -- --rerank   # also run the LLM rerank pass
 *
 * Needs DATABASE_URL (point at prod for the real archive), OPENROUTER_API_KEY,
 * and DISCORD_EMBEDDINGS_ENABLED=true for the semantic half. A failing case
 * isn't necessarily a bug — it's a signal to inspect retrieval or fix the case.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { searchArchiveMessages } from "../src/lib/discord/archive";
import { embedQuery } from "../src/lib/discord/embeddings";
import { rerankHits } from "../src/lib/discord/rerank";

loadEnv();

type Case = {
  id: string;
  query: string;
  expectAll?: string[];
  expectAny?: string[];
  recentMonths?: number;
  limit?: number;
  note?: string;
};

const useRerank = process.argv.includes("--rerank");
const cases: Case[] = JSON.parse(readFileSync(join(process.cwd(), "scripts/discord-eval-cases.json"), "utf8"));

function has(blob: string, term: string): boolean {
  return blob.includes(term.toLowerCase());
}

async function run() {
  console.log(`\nRetrieval eval — ${cases.length} cases${useRerank ? " (with rerank)" : ""}\n`);
  let passed = 0;

  for (const c of cases) {
    const limit = c.limit ?? 12;
    const after = c.recentMonths ? new Date(Date.now() - c.recentMonths * 30 * 864e5) : undefined;
    let blob = "";
    let topNote = "";
    try {
      const queryEmbedding = (await embedQuery(c.query)) ?? undefined;
      let hits = await searchArchiveMessages({ query: c.query, queryEmbedding, after, limit: useRerank ? limit * 3 : limit });
      if (useRerank && hits.length > limit) hits = await rerankHits(c.query, hits, limit);
      blob = hits.map((h) => h.text).join("\n").toLowerCase();
      topNote = hits[0] ? `top: ${hits[0].text.replace(/\s+/g, " ").slice(0, 80)}…` : "no hits";
    } catch (err) {
      console.log(`✗ ${c.id} — ERROR: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const missingAll = (c.expectAll ?? []).filter((t) => !has(blob, t));
    const anyOk = !c.expectAny?.length || c.expectAny.some((t) => has(blob, t));
    const ok = missingAll.length === 0 && anyOk;
    if (ok) passed++;

    console.log(`${ok ? "✓" : "✗"} ${c.id}`);
    if (!ok) {
      if (missingAll.length) console.log(`    missing (all-required): ${missingAll.join(", ")}`);
      if (!anyOk) console.log(`    none of (any-required): ${c.expectAny!.join(", ")}`);
      console.log(`    ${topNote}`);
    }
  }

  console.log(`\n${passed}/${cases.length} passed (${Math.round((passed / cases.length) * 100)}%)\n`);
}

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
