/**
 * world-scan-furniture — STAGE 1 of the furniture catalog pipeline.
 *
 * Walks every LimeZu "Theme_Sorter_Singles" theme folder (16x16) and emits
 * a draft manifest: one entry per single sprite with a STABLE key, its
 * theme, an alpha-bbox footprint (tileW/tileH), and the on-disk path. No
 * DB writes, no atlas packing — this is pure mechanical discovery, safe to
 * re-run anytime (e.g. after a pack update). Human work lives in the
 * separate catalog-seed.json and is keyed by the same stable key, so a
 * re-scan never clobbers names/prices.
 *
 *   npx tsx scripts/world-scan-furniture.ts
 *
 * Output: assets-src/runtime/world/catalog/draft.json  (gitignored)
 * Consumed by: World Studio "Furniture catalog" view.
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { itemKey, themeLabel, themeSlug } from "../src/modules/world/catalog";

const SINGLES_DIR =
  "assets-src/modern-interiors/1_Interiors/16x16/Theme_Sorter_Singles";
const OUT = "assets-src/runtime/world/catalog/draft.json";
const TILE = 16;

export type DraftItem = {
  key: string; // stable: mi-<theme>-<n>
  theme: string; // slug, e.g. "living-room"
  themeLabel: string; // "Living Room"
  file: string; // repo-relative path to the source PNG
  pxW: number; // trimmed (alpha-bbox) pixel dims
  pxH: number;
  tileW: number; // ceil(px / 16), min 1
  tileH: number;
};

/** Tight alpha bounding box of a PNG, so footprint ignores transparent padding. */
async function bbox(file: string): Promise<{ w: number; h: number }> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { w: 0, h: 0 }; // fully transparent
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function main() {
  if (!fs.existsSync(SINGLES_DIR)) {
    console.error(`✖ singles dir not found: ${SINGLES_DIR}`);
    console.error("  Re-download Modern Interiors per docs/world-design.md.");
    process.exit(1);
  }

  const themes = fs
    .readdirSync(SINGLES_DIR)
    .filter((d) => fs.statSync(path.join(SINGLES_DIR, d)).isDirectory())
    .sort();

  const items: DraftItem[] = [];
  let skippedEmpty = 0;
  for (const folder of themes) {
    const theme = themeSlug(folder);
    const label = themeLabel(folder);
    const dir = path.join(SINGLES_DIR, folder);
    const pngs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort();
    let kept = 0;
    for (const file of pngs) {
      const abs = path.join(dir, file);
      const { w, h } = await bbox(abs);
      if (w === 0) {
        skippedEmpty++;
        continue; // blank sprite slot in the pack
      }
      items.push({
        key: itemKey(folder, file),
        theme,
        themeLabel: label,
        file: abs,
        pxW: w,
        pxH: h,
        tileW: Math.max(1, Math.ceil(w / TILE)),
        tileH: Math.max(1, Math.ceil(h / TILE)),
      });
      kept++;
    }
    console.log(`${label.padEnd(34)} ${kept} sprites`);
  }

  // de-dupe keys defensively (shouldn't happen; pack numbering is unique)
  const seen = new Set<string>();
  const deduped = items.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { generatedFrom: SINGLES_DIR, themes: themes.length, count: deduped.length, items: deduped },
      null,
      0
    )
  );
  console.log(
    `\n✔ ${deduped.length} sprites across ${themes.length} themes → ${OUT}` +
      (skippedEmpty ? `  (${skippedEmpty} blank slots skipped)` : "")
  );
}

main();
