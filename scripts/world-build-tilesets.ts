/**
 * Rebuilds the composite Tiled tileset PNGs from the LimeZu Modern
 * Exteriors pack. The PNGs are licensed art and NOT committed; the .tsx
 * files, map, and manifest ARE committed. Run this once per machine after
 * downloading the pack from itch.io into assets-src/modern-exteriors/.
 *
 *   npx tsx scripts/world-build-tilesets.ts
 *
 * Layout must match the committed .tsx files exactly — if you change the
 * category composition here, the script rewrites the .tsx files too, but
 * any already-painted map keeps old gids, so only reorder/append, never
 * remove or shrink a sheet that a painted map references.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ME = "assets-src/modern-exteriors/Modern_Exteriors_16x16";
const TS = `${ME}/ME_Theme_Sorter_16x16`;
const AN = `${ME}/Animated_16x16/Animated_Terrains_16x16`;
const OUT = "assets-src/runtime/world/tilesets";
const TMP = `${OUT}/composites/.tmp`;

// Animated water sheets store frames side-by-side; only frame 0 is
// paintable in Tiled. { src, w, h } = first-frame crop.
const WATER_CROPS = [
  { src: `${AN}/Water_Tileset_16x16.png`, out: "water_f0.png", w: 48, h: 48 },
  { src: `${AN}/Sea_Water_Tileset_16x16.png`, out: "sea_f0.png", w: 144, h: 64 },
];

const CATS: Record<string, string[]> = {
  "1_Terrain_and_Water": [
    `${TS}/1_Terrains_and_Fences_16x16.png`,
    `${TS}/21_Beach_16x16.png`,
    `${TMP}/water_f0.png`,
    `${TMP}/sea_f0.png`,
  ],
  "2_Nature_and_Outdoors": [
    `${TS}/17_Garden_16x16.png`,
    `${TS}/11_Camping_16x16.png`,
    `${TS}/19_Graveyard_16x16.png`,
  ],
  "3_City_and_Streets": [
    `${TS}/2_City_Terrains_16x16.png`,
    `${TS}/3_City_Props_16x16.png`,
    `${TS}/10_Vehicles_16x16.png`,
    `${TS}/8_Worksite_16x16.png`,
  ],
  "4_Houses": [
    `${TS}/4_Generic_Buildings_16x16.png`,
    `${TS}/7_Villas_16x16.png`,
    `${TS}/24_Additional_Houses_16x16.png`,
    `${TS}/5_Floor_Modular_Buildings_16x16.png`,
  ],
  "5_Civic_and_Shops": [
    `${TS}/9_Shopping_Center_and_Markets_16x16.png`,
    `${TS}/12_Hotel_and_Hospital_16x16.png`,
    `${TS}/13_School_16x16.png`,
    `${TS}/15_Police_Station_16x16.png`,
    `${TS}/16_Office_16x16.png`,
    `${TS}/18_Fire_Station_16x16.png`,
    `${TS}/22_Post_Office_16x16.png`,
    `${TS}/14_Swimming_Pool_16x16.png`,
  ],
  "6_Misc_and_Fun": [
    `${TS}/6_Garage_Sales_16x16.png`,
    `${TS}/20_Subway_and_Train_Station_16x16.png`,
    `${TS}/23_MIlitary_Base_16x16.png`,
  ],
};

const up16 = (n: number) => Math.ceil(n / 16) * 16;

// Tiled Terrain Sets (corner Wang sets) for the kits on the
// 1_Terrain_and_Water composite, so the Terrain Brush works directly on
// the mega-sheet (kit positions verified via world-crop-tiles.mjs).
// Layout per kit: 3x3 rounded blob at (bc,br), 2x2 inner-corner block at
// (cc,cr); fillIn/fillOut are plain fill tiles for each color.
function cornerWang(
  cols: number,
  name: string,
  inner: string,
  outer: string,
  fillIn: [number, number],
  fillOut: [number, number],
  bc: number,
  br: number,
  cc: number,
  cr: number
) {
  const id = (c: number, r: number) => r * cols + c;
  // wangid = T,TR,R,BR,B,BL,L,TL ; corner sets use indices 1,3,5,7 ; 1=inner 2=outer
  const w = (tr: number, brr: number, bl: number, tl: number, tile: number) =>
    `  <wangtile tileid="${tile}" wangid="0,${tr},0,${brr},0,${bl},0,${tl}"/>`;
  return [
    ` <wangset name="${name}" type="corner" tile="-1">`,
    `  <wangcolor name="${inner}" color="#00ff00" tile="${id(...fillIn)}" probability="1"/>`,
    `  <wangcolor name="${outer}" color="#0000ff" tile="${id(...fillOut)}" probability="1"/>`,
    w(1, 1, 1, 1, id(...fillIn)),
    w(2, 2, 2, 2, id(...fillOut)),
    w(2, 1, 2, 2, id(bc, br)), w(2, 1, 1, 2, id(bc + 1, br)), w(2, 2, 1, 2, id(bc + 2, br)),
    w(1, 1, 2, 2, id(bc, br + 1)), w(1, 1, 1, 1, id(bc + 1, br + 1)), w(2, 2, 1, 1, id(bc + 2, br + 1)),
    w(1, 2, 2, 2, id(bc, br + 2)), w(1, 2, 2, 1, id(bc + 1, br + 2)), w(2, 2, 2, 1, id(bc + 2, br + 2)),
    w(1, 2, 1, 1, id(cc, cr)), w(1, 1, 2, 1, id(cc + 1, cr)),
    w(2, 1, 1, 1, id(cc, cr + 1)), w(1, 1, 1, 2, id(cc + 1, cr + 1)),
    ` </wangset>`,
  ].join("\n");
}

function terrainWangsets(cols: number): string {
  const sets = [
    cornerWang(cols, "Grass / Dirt", "grass", "dirt", [1, 7], [4, 8], 0, 6, 3, 6),
    cornerWang(cols, "Grass / Water (cliff)", "grass", "water", [9, 7], [11, 8], 8, 6, 11, 6),
    cornerWang(cols, "Grass / Water", "grass", "water", [17, 7], [20, 8], 16, 6, 19, 6),
    cornerWang(cols, "Dirt patch / Grass", "dirt", "grass", [1, 31], [1, 7], 0, 30, 3, 30),
    cornerWang(cols, "Dirt (orange) / Grass", "dirt", "grass", [9, 31], [1, 7], 8, 30, 11, 30),
  ];
  return ` <wangsets>\n${sets.join("\n")}\n </wangsets>\n`;
}

async function main() {
  if (!fs.existsSync(TS)) {
    console.error(
      `Pack not found at ${TS}.\nDownload Modern Exteriors from itch.io and unzip to assets-src/modern-exteriors/ (see docs/world-design.md runbook).`
    );
    process.exit(1);
  }
  fs.mkdirSync(TMP, { recursive: true });
  for (const c of WATER_CROPS) {
    await sharp(c.src)
      .extract({ left: 0, top: 0, width: c.w, height: c.h })
      .toFile(`${TMP}/${c.out}`);
  }

  const manifest: Record<string, { source: string; y: number; rows: number }[]> = {};
  for (const [cat, files] of Object.entries(CATS)) {
    const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
    const W = up16(Math.max(...metas.map((m) => m.width!)));
    let y = 0;
    const comps: sharp.OverlayOptions[] = [];
    manifest[cat] = [];
    files.forEach((f, i) => {
      const h = up16(metas[i].height!);
      comps.push({ input: f, left: 0, top: y });
      manifest[cat].push({
        source: f.startsWith(TMP) ? path.basename(f) : path.relative(ME, f),
        y,
        rows: h / 16,
      });
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
    fs.writeFileSync(
      `${OUT}/${cat}.tsx`,
      `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.11.0" name="${cat}" tilewidth="16" tileheight="16" tilecount="${count}" columns="${cols}">\n <image source="composites/${cat}.png" width="${W}" height="${y}"/>\n${cat === "1_Terrain_and_Water" ? terrainWangsets(cols) : ""}</tileset>\n`
    );
    console.log(`${cat}: ${W}x${y} (${count} tiles)`);
  }
  fs.writeFileSync(`${OUT}/composites/manifest.json`, JSON.stringify(manifest, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("Done. Open assets-src/world.tiled-project in Tiled.");
}

main();
