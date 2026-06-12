/**
 * world-seed-catalog — STAGE 3 of the furniture catalog pipeline.
 *
 * Reads the draft manifest (scan output) + catalog-seed.json (your hand
 * tagging) and, for every item you marked KEEP:
 *   1. packs its sprite into a per-theme atlas (frame name === stable item
 *      key, so re-packing never shifts frames — placed items stay valid),
 *   2. upserts a WorldItem row (idempotent by key; price derives from tier
 *      unless you set a raw override; published from your publish flag).
 *
 *   npx tsx scripts/world-seed-catalog.ts                 # local .env DB
 *   railway run npx tsx scripts/world-seed-catalog.ts     # prod DB
 *   npx tsx scripts/world-seed-catalog.ts --atlas-only    # repack, no DB
 *   npx tsx scripts/world-seed-catalog.ts --dry-run       # report only
 *
 * After this, `npx tsx scripts/world-sync-assets.ts` pushes the atlases to
 * S3. The /world/admin catalog tab is the ongoing-edit surface from here.
 */
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

import { atlasKey, priceFor, spriteKeyFor } from "../src/modules/world/catalog";
import type { DraftItem } from "./world-scan-furniture";

const DRAFT = "assets-src/runtime/world/catalog/draft.json";
const SEED = "src/modules/world/catalog-seed.json";
const ATLAS_DIR = "assets-src/runtime/world/atlas";
const MAX_W = 1024; // page width; height grows as needed (single page/theme)

type SeedEntry = {
  name?: string;
  category?: string;
  tier?: string;
  price?: number | null; // raw override; null/absent = derive from tier
  surface?: string;
  availability?: string; // "shop" (default) | "unobtainable"
  keep?: boolean;
  publish?: boolean;
};
type Seed = { items: Record<string, SeedEntry> };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const atlasOnly = args.includes("--atlas-only");

function loadDraft(): DraftItem[] {
  if (!fs.existsSync(DRAFT)) {
    console.error(`✖ no draft manifest — run: npx tsx scripts/world-scan-furniture.ts`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DRAFT, "utf8")).items as DraftItem[];
}

function loadSeed(): Seed {
  if (!fs.existsSync(SEED)) {
    console.error(`✖ no catalog-seed.json yet — tag some items in World Studio first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SEED, "utf8")) as Seed;
}

/** Shelf-pack a theme's keepers into one atlas page (frame name = item key). */
async function packTheme(theme: string, members: DraftItem[]) {
  const sorted = [...members].sort((a, b) => b.pxH - a.pxH);
  const frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
  const composites: sharp.OverlayOptions[] = [];
  const PAD = 1;
  let x = PAD,
    y = PAD,
    shelfH = 0,
    pageW = 0,
    pageH = 0;
  for (const it of sorted) {
    // trim each sprite to its alpha bbox so the atlas is tight + footprint-true
    const buf = await sharp(it.file).trim({ threshold: 0 }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? it.pxW,
      h = meta.height ?? it.pxH;
    if (x + w + PAD > MAX_W) {
      x = PAD;
      y += shelfH + PAD;
      shelfH = 0;
    }
    composites.push({ input: buf, left: x, top: y });
    frames[it.key] = {
      frame: { x, y, w, h },
      sourceSize: { w, h },
      spriteSourceSize: { x: 0, y: 0, w, h },
    };
    x += w + PAD;
    shelfH = Math.max(shelfH, h);
    pageW = Math.max(pageW, x);
    pageH = Math.max(pageH, y + shelfH + PAD);
  }
  if (pageH > 4096) {
    console.warn(`  ⚠ ${theme}: atlas is ${pageH}px tall (>4096) — consider splitting this theme.`);
  }

  fs.mkdirSync(ATLAS_DIR, { recursive: true });
  const ak = atlasKey(theme);
  const png = await sharp({
    create: { width: pageW, height: pageH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(ATLAS_DIR, `${ak}.png`), png);
  fs.writeFileSync(
    path.join(ATLAS_DIR, `${ak}.json`),
    JSON.stringify(
      { frames, meta: { image: `${ak}.png`, format: "RGBA8888", size: { w: pageW, h: pageH }, scale: 1 } },
      null,
      0
    )
  );
  return { atlasKey: ak, count: members.length, w: pageW, h: pageH };
}

async function main() {
  const draft = loadDraft();
  const seed = loadSeed();
  const byKey = new Map(draft.map((d) => [d.key, d]));

  const keepers = Object.entries(seed.items)
    .filter(([, e]) => e.keep)
    .map(([key, e]) => ({ key, entry: e, draft: byKey.get(key) }))
    .filter((k): k is { key: string; entry: SeedEntry; draft: DraftItem } => {
      if (!k.draft) console.warn(`  ⚠ ${k.key}: kept but not in draft manifest — skipped (re-scan?).`);
      return !!k.draft;
    });

  if (keepers.length === 0) {
    console.log("No items marked Keep yet — nothing to seed.");
    return;
  }

  // group keepers by theme → one atlas per theme
  const byTheme = new Map<string, DraftItem[]>();
  for (const k of keepers) {
    const arr = byTheme.get(k.draft.theme) ?? [];
    arr.push(k.draft);
    byTheme.set(k.draft.theme, arr);
  }

  console.log(`Packing ${keepers.length} keepers across ${byTheme.size} themes…`);
  for (const [theme, members] of byTheme) {
    const r = await packTheme(theme, members);
    console.log(`  ${theme.padEnd(28)} ${r.count} → ${r.atlasKey}.png (${r.w}×${r.h})`);
  }

  if (atlasOnly) {
    console.log(`\n✔ atlases written to ${ATLAS_DIR} (--atlas-only; no DB writes).`);
    return;
  }

  const published = keepers.filter((k) => k.entry.publish).length;
  console.log(`\nUpserting ${keepers.length} WorldItem rows (${published} published)…`);
  if (dryRun) {
    for (const k of keepers.slice(0, 10)) {
      const un = k.entry.availability === "unobtainable";
      const price = un ? "🔒unobtainable" : priceFor(k.entry.tier, k.entry.price) + "c";
      console.log(`  ${k.key.padEnd(28)} ${(k.entry.name ?? "(unnamed)").padEnd(22)} ${un ? "-" : k.entry.tier ?? "-"} ${price} ${k.entry.publish ? "PUB" : "draft"}`);
    }
    console.log(`  …(${keepers.length} total) — --dry-run, no writes.`);
    return;
  }

  const db = new PrismaClient();
  try {
    let n = 0;
    for (const k of keepers) {
      const d = k.draft;
      const e = k.entry;
      const unobtainable = e.availability === "unobtainable";
      const data = {
        name: (e.name ?? "").trim() || d.themeLabel + " item",
        category: (e.category ?? "").trim() || d.theme,
        theme: d.theme,
        tier: unobtainable ? null : e.tier ?? null,
        price: unobtainable ? 0 : priceFor(e.tier, e.price), // unobtainables never sell
        spriteKey: spriteKeyFor(d.theme, k.key),
        tileW: d.tileW,
        tileH: d.tileH,
        surface: e.surface ?? "floor",
        availability: unobtainable ? "unobtainable" : "shop",
        published: !!e.publish,
      };
      await db.worldItem.upsert({ where: { key: k.key }, create: { key: k.key, ...data }, update: data });
      if (++n % 50 === 0) console.log(`  …${n}/${keepers.length}`);
    }
    console.log(`\n✔ seeded ${n} items. Next: npx tsx scripts/world-sync-assets.ts (push atlases to S3).`);
  } finally {
    await db.$disconnect();
  }
}

main();
