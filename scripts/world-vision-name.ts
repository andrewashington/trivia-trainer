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
const DRY = args.includes("--dry"); // print results, don't touch catalog-seed.json
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

function promptFor(n: number, theme: string, sizes: string): string {
  return `You are cataloguing pixel-art props for a cozy decorative game shop. EVERY sprite on this sheet is from the pack's "${theme}" set, so it depicts something you'd find in a ${theme} setting — use that as STRONG context. A tiny ambiguous sprite that could be many things is almost certainly the specific ${theme} item it resembles (e.g. in a Fishing set, a small box is a tackle box, a rod-shaped object is a fishing rod). Name the SPECIFIC item the theme implies, not a generic look-alike.

The image is a labeled contact sheet of ${n} sprites, numbered #1..#${n} at the bottom-left of each cell. Sprites that are adjacent and look like the same object in different colours/materials are colourway variants of ONE object.

IMPORTANT — real-world SIZE: the sheet scales every sprite to fill its cell, so it does NOT show relative size. Use these true footprints (in 16px tiles) to disambiguate — a 1×1 is a small desktop/clutter object, 1×2 / 2×2 are mid furniture, 3×3+ are big furniture. Footprints: ${sizes}.

Reply with ONLY a JSON object of the form {"items": [ ... ]} containing exactly ${n} objects — no prose, no markdown fences. One object per sprite:
- "idx": the sprite number (1..${n}).
- "name": a short, real, browsable item name ("Velvet Armchair", "Oak Bookshelf"). The joke goes in "tagline", NOT here. Sprites that share a "variantGroup" MUST share the EXACT same "name". If two sprites that are NOT variants would otherwise get the same name, differentiate them (e.g. "Tackle Box" vs "Mini Tackle Box", "Floor Lamp" vs "Table Lamp").
- "variantGroup": a short slug shared ONLY by colourway/material variants of the SAME object on THIS sheet (e.g. "armchair-a"). Rule: if two sprites wouldn't get the identical "name", they are NOT one group — set null. null when an item has no sibling variants here.
- "variant": for grouped items, the distinguishing colour/material label ("Oak","Birch","Sage","Crimson"); null otherwise.
- "tags": array of 3-7 keywords for search/filtering — cover material, dominant colour, style/era, and vibe. Each tag MUST be lowercase and a single token: hyphenate multi-word tags (use "dark-wood" not "dark wood", "terracotta" not "terra cotta").
- "tagline": ONE short, dry, ironic line of shop copy. Funny, never twee, never cutesy. e.g. "Where ambition goes to nap."
- "category": functional group, lowercase (seating, table, bed, storage, lighting, plant, rug, wall-decor, electronics, appliance, decor, ...). If the sprite is NOT a placeable decorative object (a bare floor/wall tile, a fragment, a UI element), use "non-item" and set confidence ≤ 0.2.
- "tier": one of: ${TIER_LIST}. Pick by how impressive/expensive it reads; reserve "statement"/"absurd" for genuine show-off pieces.
- "surface": one of ${SURFACES.join(", ")}. "wall"=hangs on a wall (paintings, mirrors, wall shelves); "ceiling"=hangs from above (chandeliers, hanging lamps/plants); "tabletop"=small things that sit ON furniture (mugs, lamps, books, figurines); else "floor".
- "confidence": 0..1, honest; low for ambiguous tiny sprites.`;
}

/** Parse the model reply into an item array — accepts {"items":[...]}, a bare
 *  array, or either wrapped in code fences. */
function parseItems(content: string): Record<string, unknown>[] {
  let txt = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const j = JSON.parse(txt);
    if (Array.isArray(j)) return j;
    if (Array.isArray((j as { items?: unknown }).items)) return (j as { items: Record<string, unknown>[] }).items;
  } catch { /* fall through to bracket extraction */ }
  const s = txt.indexOf("["), e = txt.lastIndexOf("]");
  if (s >= 0 && e > s) return JSON.parse(txt.slice(s, e + 1)) as Record<string, unknown>[];
  throw new Error(`no JSON items in reply: ${txt.slice(0, 200)}`);
}

async function callModel(dataUrl: string, n: number, theme: string, sizes: string): Promise<Record<string, unknown>[]> {
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
      response_format: { type: "json_object" }, // guarantee a valid JSON object back
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptFor(n, theme, sizes) },
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
  return parseItems(data.choices?.[0]?.message?.content ?? "");
}

const usageTotals = { prompt: 0, completion: 0, cost: 0 };

async function main() {
  if (!fs.existsSync(DRAFT)) { console.error("✖ run world-scan-furniture first."); process.exit(1); }
  const draft = (JSON.parse(fs.readFileSync(DRAFT, "utf8")).items ?? []) as DraftItem[];
  const seed = loadSeed();
  let items = themeArg ? draft.filter((d) => d.theme === themeArg) : draft;
  // --force      re-do AI-named items (e.g. an improved prompt) but KEEP human decisions
  // --force-human also re-do hand kept/skipped items (rare)
  const FORCE = args.includes("--force");
  const FORCE_HUMAN = args.includes("--force-human");
  const before = items.length;
  items = items.filter((d) => {
    const e = seed.items[d.key];
    if (!e) return true; // unnamed → name it
    if (e.keep || e.skip) return FORCE_HUMAN; // human-decided: preserve unless forced
    if (e.ai) return FORCE; // AI-named draft: redo only with --force
    return true;
  });
  const skipped = before - items.length;
  if (items.length === 0) { console.error(`✖ nothing to name${themeArg ? ` for "${themeArg}"` : ""}${skipped ? ` (${skipped} already named/decided — use --force to redo AI, --force-human to redo hand decisions)` : ""}.`); process.exit(1); }

  // chunk WITHIN each theme so every montage is single-theme (theme = strong context)
  const byTheme = new Map<string, DraftItem[]>();
  for (const it of items) (byTheme.get(it.theme) ?? byTheme.set(it.theme, []).get(it.theme)!).push(it);
  const chunks: DraftItem[][] = [];
  for (const [, list] of [...byTheme].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => numOf(a.key) - numOf(b.key));
    for (let i = 0; i < list.length; i += BATCH) chunks.push(list.slice(i, i + BATCH));
  }
  const decided = skipped; // for the summary line below
  const run = chunks.slice(0, LIMIT);
  console.log(`Model ${MODEL} · ${items.length} sprites${decided ? ` (skipping ${decided} already decided)` : ""} · ${run.length}/${chunks.length} montage(s) of ≤${BATCH}\n`);

  let named = 0, failed = 0;
  for (let c = 0; c < run.length; c++) {
    const chunk = run[c];
    process.stdout.write(`  montage ${c + 1}/${run.length} (${chunk.length}) … `);
    try {
      const url = await sheet(chunk);
      const sizes = chunk.map((it, i) => `#${i + 1}=${it.tileW}×${it.tileH}`).join(", ");
      const arr = await callModel(url, chunk.length, chunk[0].themeLabel, sizes);
      if (DRY) console.log("✓\n");
      for (const o of arr) {
        const i = Number(o.idx) - 1;
        const it = chunk[i];
        if (!it) continue;
        const tags = Array.isArray(o.tags) ? o.tags.map(String).slice(0, 8) : [];
        if (DRY) {
          const grp = o.variantGroup ? `  [${o.variantGroup}${o.variant ? `:${o.variant}` : ""}]` : "";
          console.log(
            `  #${String(o.idx).padEnd(2)} ${it.tileW}×${it.tileH}  ${String(o.name ?? "?").padEnd(24)} ` +
              `${String(o.tier ?? "-").padEnd(9)} ${String(o.surface ?? "-").padEnd(8)} ` +
              `c=${o.confidence ?? "?"}${grp}\n        “${o.tagline ?? ""}”   {${tags.join(", ")}}`
          );
          named++;
          continue;
        }
        const ex = seed.items[it.key] ?? {};
        seed.items[it.key] = {
          ...ex,
          name: String(o.name ?? ex.name ?? "").trim(),
          variantGroup: o.variantGroup ? String(o.variantGroup) : null,
          variant: o.variant ? String(o.variant) : null,
          tagline: o.tagline ? String(o.tagline) : null,
          tags,
          category: o.category ? String(o.category) : ex.category,
          tier: TIERS.some((t) => t.key === o.tier) ? String(o.tier) : ex.tier,
          surface: SURFACES.includes(String(o.surface) as never) ? String(o.surface) : ex.surface,
          confidence: typeof o.confidence === "number" ? o.confidence : null,
          ai: true,
        };
        named++;
      }
      if (!DRY) { saveSeed(seed); console.log(`✓ ${arr.length}`); } // checkpoint after each montage
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
