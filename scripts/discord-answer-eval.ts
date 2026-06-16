/**
 * Answer-quality eval — judges the assistant's ACTUAL replies, not just whether
 * retrieval surfaced the right segment. Pulls recent DiscordAssistantRun traces
 * (prompt + the search snippets it saw + its reply) and LLM-judges each on the
 * three things that were going wrong: grounding, attribution, and collation.
 *
 *   npm run discord:answer-eval            # judge the last 20 search-using runs
 *   npm run discord:answer-eval -- 40      # last N
 *
 * Run it now for a baseline, then again after a few days of post-fix traffic to
 * see the numbers move. Needs DATABASE_URL + OPENROUTER_API_KEY.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { chatJSON } from "../src/lib/ai";

loadEnv();
const db = new PrismaClient();
const N = Number(process.argv.find((a) => /^\d+$/.test(a))) || 20;

const SYSTEM =
  "You audit a Discord assistant that answers questions from a friend group's chat archive. You are given the user's question, the SEARCH SNIPPETS the bot retrieved (each line is 'Name: text'), and the bot's REPLY. Score 0.0–1.0 and be strict:\n" +
  "- grounded: are the reply's factual claims actually supported by the snippets (not invented)?\n" +
  "- attribution: does it credit quotes/opinions to the right person per the snippet names (no mixing people up)?\n" +
  "- collation: does it synthesize across MULTIPLE snippets, or just parrot one (single-source = low)?\n" +
  "Note any specific misattribution or hallucination in `issues` (empty string if none).";

const Judge = z.object({
  grounded: z.number().min(0).max(1),
  attribution: z.number().min(0).max(1),
  collation: z.number().min(0).max(1),
  issues: z.string(),
});

type Trace = {
  userPrompt?: string;
  reply?: string | null;
  toolCalls?: { tool: string; args: Record<string, unknown>; result: string }[];
};

async function run() {
  const rows = await db.$queryRaw<{ id: string; prompt: string; reply: string | null; trace: Trace }[]>`
    SELECT id, prompt, reply, trace FROM "DiscordAssistantRun"
    WHERE ok = true AND trace->'toolCalls' @> '[{"tool":"search_messages"}]'
    ORDER BY "createdAt" DESC LIMIT ${N}
  `;
  if (!rows.length) {
    console.log("No search-using runs found.");
    return;
  }

  const sums = { grounded: 0, attribution: 0, collation: 0 };
  let judged = 0;
  console.log(`\nAnswer eval — ${rows.length} runs\n`);

  for (const r of rows) {
    const snippets = (r.trace.toolCalls ?? [])
      .filter((t) => t.tool === "search_messages")
      .map((t) => t.result)
      .join("\n---\n")
      .slice(0, 8000);
    const reply = r.reply ?? r.trace.reply ?? "";
    if (!snippets || !reply) continue;
    try {
      const v = await chatJSON({
        system: SYSTEM,
        user: `QUESTION:\n${r.prompt}\n\nSEARCH SNIPPETS:\n${snippets}\n\nREPLY:\n${reply}`,
        schema: Judge,
        maxTokens: 300,
      });
      sums.grounded += v.grounded;
      sums.attribution += v.attribution;
      sums.collation += v.collation;
      judged++;
      const flag = Math.min(v.grounded, v.attribution, v.collation) < 0.6 ? "⚠ " : "  ";
      console.log(
        `${flag}g=${v.grounded.toFixed(2)} a=${v.attribution.toFixed(2)} c=${v.collation.toFixed(2)}  ${r.prompt.replace(/\s+/g, " ").slice(0, 56)}`,
      );
      if (v.issues.trim()) console.log(`      ↳ ${v.issues.replace(/\s+/g, " ").slice(0, 140)}`);
    } catch (err) {
      console.log(`  (judge failed for ${r.id}: ${err instanceof Error ? err.message : err})`);
    }
  }

  if (judged) {
    console.log(
      `\naverages over ${judged}: grounded ${(sums.grounded / judged).toFixed(2)} · ` +
        `attribution ${(sums.attribution / judged).toFixed(2)} · collation ${(sums.collation / judged).toFixed(2)}\n`,
    );
  }
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
  .finally(() => db.$disconnect());
