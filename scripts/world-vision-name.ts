/**
 * world-vision-name — AI-assist the furniture catalog: a cheap vision model
 * looks at the pack sprites and proposes names, variant grouping, price tier,
 * surface, and an ironic shop tagline. It writes SUGGESTIONS into
 * catalog-seed.json (keyed by stable item key) — it never marks items
 * keep/publish; you review + approve in World Studio (queue/grid), where the
 * names/tiers come pre-filled. Turns "type 5,381 names" into "approve them".
 *
 * Uses OpenRouter (OpenAI-compatible) so the vision model is a config knob —
 * pick whatever's cheapest/best. Raw fetch, no SDK dependency.
 *
 *   OPENROUTER_API_KEY=... in .env (or env)
 *   npx tsx scripts/world-vision-name.ts --theme living-room        # one theme
 *   npx tsx scripts/world-vision-name.ts                            # all themes
 *   npx tsx scripts/world-vision-name.ts --theme bedroom --model google/gemini-2.0-flash-001
 *   npx tsx scripts/world-vision-name.ts --theme art --limit 1      # one montage (cheap test)
 *
 * Sprites are sent ~24 at a time as ONE labeled contact sheet (pack order),
 * so the model sees variants side by side and groups them. Prints real token
 * usage + cost after the run — prototype one theme to measure before the lot.
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { SURFACES, TIERS, themeSlug } from "../src/modules/world/catalog";
import type { DraftItem } from "./world-scan-furniture";

const DRAFT = "assets-src/runtime/world/catalog/draft.json";
const SEED = "src/modules/world/catalog-seed.json";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TILE = 16;

// load .env (tsx doesn't) — minimal parse, same as world-sync-assets
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const themeArg = opt("theme") ? themeSlug(opt("theme")!) : undefined;
const MODEL = opt("model") ?? process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.0-flash-001";
const BATCH = Number(opt("batch") ?? 24);
const LIMIT = opt("limit") ? Number(opt("limit")) : Infinity;
const CELL = 96; // contact-sheet cell px; 16px sprite → ~5–6× upscale

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error("✖ OPENROUTER_API_KEY not set (put it in .env or the environment).");
  process.exit(1);
}

type Seed = { items: Record<string, Record<string, unknown>> };
const loadSeed = (): Seed =>
  fs.existsSync(SEED) ? { items: JSON.parse(fs.readFileSync(SEED, "utf8")).items ?? {} } : { items: {} };
const saveSeed = (s: Seed) => fs.writeFileSync(SEED, JSON.stringify(s, null, 2));

const numOf = (key: string) => Number(key.match(/-(\d+)$/)?.[1] ?? 0);

/** Build one labeled contact sheet (index per cell) from a chunk of sprites. */
async function sheet(chunk: DraftItem[]): Promise<string> {
  const cols = 6;
  const rows = Math.ceil(chunk.length / cols);
  const W = cols * CELL, H = rows * CELL;
  const comps: sharp.OverlayOptions[] = [];
  const labels: string[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const buf = await sharp(chunk[i].file)
      .resize(CELL - 16, CELL - 26, { fit: "inside", kernel: "nearest" })
      .png().toBuffer();
    const cx = (i % cols) * CELL, cy = Math.floor(i / cols) * CELL;
    comps.push({ input: buf, left: cx + 8, top: cy + 6 });
    labels.push(`<text x="${cx + 5}" y="${cy + CELL - 6}" font-size="13" font-family="monospace" fill="#0a7d00" font-weight="bold">#${i + 1}</text>`);
  }
  const svg = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#e9e4d8"/>${labels.join("")}</svg>`);
  const png = await sharp(svg).composite(comps).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const TIER_LIST = TIERS.map((t) => `${t.key} (${t.blurb})`).join("; ");

function promptFor(n: number): string {
  return `You are cataloguing pixel-art furniture for a cozy decorative game shop. The image is a labeled contact sheet of ${n} furniture sprites, numbered #1..#${n} in the bottom-left of each cell.

For EACH sprite return one object. Reply with ONLY a JSON array of exactly ${n} objects, no prose, no markdown fences.

Fields per object:
- "idx": the sprite number (1..${n}).
- "name": a short, real, browsable item name (e.g. "Velvet Armchair", "Oak Bookshelf"). NOT a joke — the joke goes in "tagline".
- "variantGroup": a short slug shared by colorways/materials of the SAME object that appear in this sheet (e.g. "armchair-a"). Adjacent sprites that are clearly the same object in different colors/materials/woods MUST share this slug. If an item has no sibling variants here, use null.
- "variant": when in a variantGroup, this one's distinguishing label — the colour or material ("Oak", "Birch", "Sage", "Crimson"). null if not a variant.
- "tagline": ONE short ironic, satirical, over-the-top line of shop copy. Dry and funny, never twee, never cutesy. e.g. "Where ambition goes to nap."
- "category": functional group, lowercase (seating, table, bed, storage, lighting, plant, rug, wall-decor, appliance, electronics, decor, ...).
- "tier": one of: ${TIER_LIST}. Pick by how impressive/expensive the piece reads.
- "surface": one of ${SURFACES.join(", ")} — "wall" for things that hang (paintings, mirrors, wall shelves), "tabletop" for small things that sit ON furniture (mugs, lamps, books, figurines), else "floor".
- "confidence": 0..1, your confidence in the name/variant. Be honest; low for ambiguous tiny sprites.`;
}

async function callModel(dataUrl: string, n: number): Promise<Record<string, unknown>[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://udm-plus.up.railway.app",
      "X-Title": "UDM+ World catalog",
    },
    body: JSON.stringify({
      model: MODEL,
      usage: { include: true },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptFor(n) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  usageTotals.prompt += data.usage?.prompt_tokens ?? 0;
  usageTotals.completion += data.usage?.completion_tokens ?? 0;
  usageTotals.cost += data.usage?.cost ?? 0;
  let txt = (data.choices?.[0]?.message?.content ?? "").trim();
  txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = txt.indexOf("["), end = txt.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error(`no JSON array in reply: ${txt.slice(0, 200)}`);
  return JSON.parse(txt.slice(start, end + 1)) as Record<string, unknown>[];
}

const usageTotals = { prompt: 0, completion: 0, cost: 0 };

async function main() {
  if (!fs.existsSync(DRAFT)) { console.error("✖ run world-scan-furniture first."); process.exit(1); }
  const draft = (JSON.parse(fs.readFileSync(DRAFT, "utf8")).items ?? []) as DraftItem[];
  let items = themeArg ? draft.filter((d) => d.theme === themeArg) : draft;
  items = items.sort((a, b) => a.theme.localeCompare(b.theme) || numOf(a.key) - numOf(b.key));
  if (items.length === 0) { console.error(`✖ no sprites${themeArg ? ` for theme "${themeArg}"` : ""}.`); process.exit(1); }

  const chunks: DraftItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH) chunks.push(items.slice(i, i + BATCH));
  const run = chunks.slice(0, LIMIT);
  console.log(`Model ${MODEL} · ${items.length} sprites · ${run.length}/${chunks.length} montage(s) of ≤${BATCH}\n`);

  const seed = loadSeed();
  let named = 0, failed = 0;
  for (let c = 0; c < run.length; c++) {
    const chunk = run[c];
    process.stdout.write(`  montage ${c + 1}/${run.length} (${chunk.length}) … `);
    try {
      const url = await sheet(chunk);
      const arr = await callModel(url, chunk.length);
      for (const o of arr) {
        const i = Number(o.idx) - 1;
        const it = chunk[i];
        if (!it) continue;
        const ex = seed.items[it.key] ?? {};
        seed.items[it.key] = {
          ...ex,
          name: String(o.name ?? ex.name ?? "").trim(),
          variantGroup: o.variantGroup ? String(o.variantGroup) : null,
          variant: o.variant ? String(o.variant) : null,
          tagline: o.tagline ? String(o.tagline) : null,
          category: o.category ? String(o.category) : ex.category,
          tier: TIERS.some((t) => t.key === o.tier) ? String(o.tier) : ex.tier,
          surface: SURFACES.includes(String(o.surface) as never) ? String(o.surface) : ex.surface,
          confidence: typeof o.confidence === "number" ? o.confidence : null,
          ai: true,
        };
        named++;
      }
      saveSeed(seed); // checkpoint after each montage — safe to ctrl-c
      console.log(`✓ ${arr.length}`);
    } catch (e) {
      failed++;
      console.log(`✖ ${(e as Error).message.slice(0, 120)}`);
    }
  }

  const cost = usageTotals.cost
    ? `$${usageTotals.cost.toFixed(4)}`
    : `(cost not reported by model)`;
  console.log(`\n✔ named ${named} sprites${failed ? `, ${failed} montage(s) failed` : ""}.`);
  console.log(`   tokens: ${usageTotals.prompt} in / ${usageTotals.completion} out · cost ${cost}`);
  if (themeArg && run.length < chunks.length)
    console.log(`   (ran ${run.length}/${chunks.length} montages — drop --limit for the rest)`);
  console.log(`   Review + approve in World Studio → Furniture catalog (names are pre-filled).`);
}

main();
