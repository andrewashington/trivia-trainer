/**
 * Rebuilds the composite Tiled tileset PNGs for INTERIORS from the LimeZu
 * Modern Interiors pack — mirror of world-build-tilesets.ts (exteriors).
 * PNGs are licensed art and NOT committed; the .tsx files, template map,
 * and manifest ARE committed. Run once per machine after downloading the
 * pack from itch.io into assets-src/modern-interiors/.
 *
 *   npx tsx scripts/world-build-interior-tilesets.ts
 *
 * Layout must match the committed .tsx files exactly — if you change the
 * category composition here, the script rewrites the .tsx files too, but
 * any already-painted map keeps old gids, so only reorder/append, never
 * remove or shrink a sheet that a painted map references.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const MI = "assets-src/modern-interiors/1_Interiors/16x16";
const TS = `${MI}/Theme_Sorter`;
const RB = `${MI}/Room_Builder_subfiles`;
const OUT = "assets-src/runtime/world/tilesets";

// "I" prefix keeps interior sheets grouped after the exterior categories
// in Tiled's tileset list. Room Builder (floors/walls/baseboards/entryway
// structural kit) gets its own sheet; the themed furniture/decor sheets
// are grouped by where you'd use them.
const CATS: Record<string, string[]> = {
  I1_Room_Builder: [
    `${MI}/Room_Builder_16x16.png`,
    `${RB}/Room_Builder_Floor_Shadows_16x16.png`,
  ],
  I2_Generic_and_Living: [
    `${TS}/1_Generic_16x16.png`,
    `${TS}/2_LivingRoom_16x16.png`,
    `${TS}/26_Condominium.png`,
  ],
  I3_Kitchen_Bath_Bedroom: [
    `${TS}/12_Kitchen_16x16.png`,
    `${TS}/3_Bathroom_16x16.png`,
    `${TS}/4_Bedroom_16x16.png`,
  ],
  I4_Work_and_Civic: [
    `${TS}/5_Classroom_and_library_16x16.png`,
    `${TS}/13_Conference_Hall_16x16.png`,
    `${TS}/19_Hospital_16x16.png`,
    `${TS}/18_Jail_16x16.png`,
    `${TS}/17_Visibile_Upstairs_System_16x16.png`,
  ],
  I5_Shops_and_Studios: [
    `${TS}/16_Grocery_store_16x16.png`,
    `${TS}/21_Clothing_Store.png`,
    `${TS}/24_Ice_Cream_Shop.png`,
    `${TS}/22_Museum.png`,
    `${TS}/23_Television_and_Film_Studio.png`,
  ],
  I6_Hobby_and_Seasonal: [
    `${TS}/6_Music_and_sport_16x16.png`,
    `${TS}/8_Gym_16x16.png`,
    `${TS}/7_Art_16x16.png`,
    `${TS}/9_Fishing_16x16.png`,
    `${TS}/25_Shooting_Range.png`,
    `${TS}/10_Birthday_party_16x16.png`,
    `${TS}/11_Halloween_16x16.png`,
    `${TS}/15_Christmas_16x16.png`,
    `${TS}/20_Japanese_interiors.png`,
    `${TS}/14_Basement_16x16.png`,
  ],
};

const up16 = (n: number) => Math.ceil(n / 16) * 16;

async function main() {
  if (!fs.existsSync(TS)) {
    console.error(
      `Pack not found at ${TS}.\nDownload Modern Interiors from itch.io and unzip to assets-src/modern-interiors/ (see docs/world-design.md runbook).`
    );
    process.exit(1);
  }
  fs.mkdirSync(`${OUT}/composites`, { recursive: true });

  const manifest: Record<string, { source: string; y: number; rows: number }[]> = {};
  const tilecounts: Record<string, number> = {};
  for (const [cat, files] of Object.entries(CATS)) {
    const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
    const W = up16(Math.max(...metas.map((m) => m.width!)));
    let y = 0;
    const comps: sharp.OverlayOptions[] = [];
    manifest[cat] = [];
    files.forEach((f, i) => {
      const h = up16(metas[i].height!);
      comps.push({ input: f, left: 0, top: y });
      manifest[cat].push({ source: path.relative(MI, f), y, rows: h / 16 });
      y += h;
    });
    await sharp({
      create: { width: W, height: y, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(comps)
      .png()
      .toFile(`${OUT}/composites/${cat}.png`);
    const cols = W / 16;
    const count = cols * (y / 16);
    tilecounts[cat] = count;
    fs.writeFileSync(
      `${OUT}/${cat}.tsx`,
      `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.11.0" name="${cat}" tilewidth="16" tileheight="16" tilecount="${count}" columns="${cols}">\n <image source="composites/${cat}.png" width="${W}" height="${y}"/>\n</tileset>\n`
    );
    console.log(`${cat}: ${W}x${y} (${count} tiles)`);
  }
  fs.writeFileSync(
    `${OUT}/composites/interiors-manifest.json`,
    JSON.stringify(manifest, null, 2)
  );
  // firstgid table for hand-authoring maps that reference these sheets
  let gid = 1;
  for (const cat of Object.keys(CATS)) {
    console.log(`firstgid ${gid}: ${cat}`);
    gid += tilecounts[cat];
  }
  console.log("Done. Open assets-src/world.tiled-project in Tiled.");
}

main();
