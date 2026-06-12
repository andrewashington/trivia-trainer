/**
 * Stages the LimeZu character-generator part sheets (16x16 adult set,
 * v1 categories only: bodies / eyes / hairstyles / outfits) into the
 * runtime asset dir and writes a manifest the creator UI + avatar API
 * consume. Accessories etc. are deliberately excluded until the store
 * flow exists.
 *
 *   npx tsx scripts/world-character-parts.ts
 *   railway run npx tsx scripts/world-sync-assets.ts   # then sync to S3
 *
 * Every part sheet shares the premade-character frame grid (16x32 frames,
 * 56 cols; row 1 = 6-frame idle, row 2 = 6-frame walk, dirs R,U,L,D).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// The shared premade-character grid: 56 cols × 16px, 656px tall. Some
// source sheets carry extra junk columns (Bodies are 927px wide — a
// palette strip); normalize everything to exactly this canvas so CSS
// previews and Phaser frame math line up.
const SHEET_W = 896;
const SHEET_H = 656;

const GEN = "assets-src/modern-interiors/2_Characters/Character_Generator";
const OUT = "assets-src/runtime/world/character-parts";

const CATS = [
  { dir: "Bodies", out: "bodies", re: /^Body_(\d+)\.png$/ },
  { dir: "Eyes", out: "eyes", re: /^Eyes_(\d+)\.png$/ },
  { dir: "Hairstyles", out: "hairstyles", re: /^Hairstyle_(\d+)_(\d+)\.png$/ },
  { dir: "Outfits", out: "outfits", re: /^Outfit_(\d+)_(\d+)\.png$/ },
] as const;

if (!fs.existsSync(GEN)) {
  console.error(`Pack not found at ${GEN} — download Modern Interiors per docs/world-design.md.`);
  process.exit(1);
}

async function stageNormalized(src: string, dst: string): Promise<void> {
  const meta = await sharp(src).metadata();
  if (meta.width === SHEET_W && meta.height === SHEET_H) {
    fs.copyFileSync(src, dst);
    return;
  }
  if (meta.width! < SHEET_W || meta.height! < SHEET_H) {
    throw new Error(`${src} is ${meta.width}x${meta.height} — smaller than the ${SHEET_W}x${SHEET_H} grid`);
  }
  await sharp(src).extract({ left: 0, top: 0, width: SHEET_W, height: SHEET_H }).toFile(dst);
}

const manifest: Record<string, string[] | Record<string, string[]>> = {};
async function main() {
for (const cat of CATS) {
  const src = path.join(GEN, cat.dir, "16x16");
  const dst = path.join(OUT, cat.out);
  fs.mkdirSync(dst, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => cat.re.test(f)).sort();
  const flat: string[] = [];
  const styled: Record<string, string[]> = {};
  for (const f of files) {
    await stageNormalized(path.join(src, f), path.join(dst, f));
    const m = f.match(cat.re)!;
    if (m[2] === undefined) {
      flat.push(m[1]);
    } else {
      (styled[m[1]] ??= []).push(m[2]);
    }
  }
  manifest[cat.out] = flat.length ? flat : styled;
  const n = flat.length || Object.keys(styled).length;
  console.log(`${cat.out}: ${files.length} sheet(s), ${n} option(s)`);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${OUT}/manifest.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
