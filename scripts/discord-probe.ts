/**
 * Retrieval PROBE — dumps the full result set the assistant's search_messages
 * tool would get, so we can SEE (not infer from a truncated trace) what comes
 * back and how ranking changes. Complements discord-eval.ts (pass/fail); this
 * one is for eyeballing + A/B diffing tool-call behavior across code changes.
 *
 *   npm run discord:probe -- "Adam"                 # one query
 *   npm run discord:probe -- --rerank "best pizza"  # with the LLM rerank pass
 *   npm run discord:probe                           # the built-in probe set
 *
 * Mirrors assistant.ts's real call: fetchLimit = rerank ? limit*3 : limit, then
 * rerank when there's a real surplus, then relabel authors for display.
 *
 * Needs DATABASE_URL (point at the prod archive), OPENROUTER_API_KEY, and
 * DISCORD_EMBEDDINGS_ENABLED=true for the semantic half.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retrieve } from "../src/lib/discord/retrieve";
import { rerankHits } from "../src/lib/discord/rerank";
import { relabelAuthors } from "../src/lib/discord/identity-map";

loadEnv();

const useRerank = process.argv.includes("--rerank");
const noExpand = process.argv.includes("--no-expand");
const queries = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PROBE_SET = ["Adam", "best pizza", "who got a promotion", "love island toby", "anthropic"];
const limit = 12;
const RERANK_MIN_SURPLUS = 4;

function authorsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const line of relabelAuthors(text).split("\n")) {
    const idx = line.indexOf(": ");
    if (idx > 0 && idx < 40) seen.add(line.slice(0, idx));
  }
  return [...seen];
}

function daysAgo(iso: string): number {
  return Math.round((Date.now() - Date.parse(iso)) / 864e5);
}

async function probe(query: string) {
  const fetchLimit = useRerank ? Math.min(30, limit * 3) : limit;
  const { hits: raw, variants, expanded } = await retrieve({ query, limit: fetchLimit, expand: !noExpand });
  const hits =
    useRerank && raw.length >= limit + RERANK_MIN_SURPLUS ? await rerankHits(query, raw, limit) : raw.slice(0, limit);

  console.log(`\n${"=".repeat(72)}\nQUERY: "${query}"   variants=${variants.length}${expanded ? "" : " (no expansion)"}`);
  variants.forEach((v, i) =>
    console.log(`    ${i === 0 ? "orig" : v.keyword === false ? "hyde" : "para"}: ${v.text.slice(0, 80)}`),
  );
  if (!hits.length) {
    console.log("  (no hits)");
    return;
  }

  const ages = hits.map((h) => daysAgo(h.at));
  const last30 = ages.filter((d) => d <= 30).length;
  const srcMix = hits.reduce<Record<string, number>>((m, h) => ((m[h.source] = (m[h.source] ?? 0) + 1), m), {});
  console.log(
    `  ${hits.length} distinct segments · age ${Math.min(...ages)}–${Math.max(...ages)}d · ` +
      `${last30}/${hits.length} from last 30d · sources ${JSON.stringify(srcMix)}`,
  );
  hits.forEach((h, i) => {
    const preview = relabelAuthors(h.text).replace(/\s+/g, " ").slice(0, 90);
    console.log(
      `  [${String(i).padStart(2)}] ${h.at.slice(0, 10)} (${String(daysAgo(h.at)).padStart(4)}d) ` +
        `${h.source[0]} s=${h.score.toFixed(3)} #${h.channelName ?? h.channelId} ` +
        `who=[${authorsOf(h.text).join(",")}]\n        ${preview}…`,
    );
  });
}

async function run() {
  const list = queries.length ? queries : PROBE_SET;
  console.log(`Probe — ${list.length} quer${list.length === 1 ? "y" : "ies"}${useRerank ? " (with rerank)" : ""}`);
  for (const q of list) await probe(q);
  console.log();
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
