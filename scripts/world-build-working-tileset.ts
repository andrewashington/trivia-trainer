/**
 * Builds 0_Working — the small, curated tileset Andrew actually authors
 * maps from, assembled out of regions of the category composite sheets
 * (so run world-build-tilesets.ts first). Also writes Tiled Terrain Sets
 * (Wang sets) into the .tsx so the Terrain Brush auto-picks transition
 * tiles for grass/dirt and grass/water, and a manifest consumed by
 * world-generate-baseline.ts.
 *
 *   npx tsx scripts/world-build-working-tileset.ts
 *
 * The PNG is gitignored (licensed art); the .tsx + manifest are committed.
 * Source coordinates were verified visually via world-crop-tiles.mjs.
 */
import sharp from "sharp";
import fs from "node:fs";

const TS = "assets-src/runtime/world/tilesets";
const SRC = {
  terrain: `${TS}/composites/1_Terrain_and_Water.png`,
  city: `${TS}/composites/3_City_and_Streets.png`,
  houses: `${TS}/composites/4_Houses.png`,
};
const T = 16, COLS = 32, ROWS = 47;
// must equal 6_Misc firstgid (93223) + its tilecount (16288)
const FIRSTGID = 109511;

type Sec = { name: string; sheet: keyof typeof SRC; c: number; r: number; w: number; h: number; dc: number; dr: number };
const SECTIONS: Sec[] = [
  // row 0: plain fills
  { name: "fill-grass", sheet: "terrain", c: 1, r: 7, w: 1, h: 1, dc: 0, dr: 0 },
  { name: "fill-dirt", sheet: "terrain", c: 4, r: 8, w: 1, h: 1, dc: 1, dr: 0 },
  { name: "fill-water", sheet: "terrain", c: 20, r: 8, w: 1, h: 1, dc: 2, dr: 0 },
  { name: "fill-sidewalk", sheet: "city", c: 9, r: 1, w: 1, h: 1, dc: 3, dr: 0 },
  { name: "fill-asphalt", sheet: "city", c: 0, r: 0, w: 1, h: 1, dc: 4, dr: 0 },
  { name: "fill-cobble", sheet: "terrain", c: 25, r: 9, w: 2, h: 2, dc: 5, dr: 0 },
  { name: "fill-brick-diag", sheet: "terrain", c: 27, r: 9, w: 1, h: 1, dc: 7, dr: 0 },
  { name: "fill-gravel", sheet: "terrain", c: 28, r: 9, w: 1, h: 1, dc: 8, dr: 0 },
  // rows 2-4: terrain transition kits (wang sets reference these)
  { name: "grass-dirt-blob", sheet: "terrain", c: 0, r: 6, w: 3, h: 3, dc: 0, dr: 2 },
  { name: "grass-dirt-corners", sheet: "terrain", c: 3, r: 6, w: 2, h: 2, dc: 4, dr: 2 },
  { name: "grass-water-blob", sheet: "terrain", c: 16, r: 6, w: 3, h: 3, dc: 8, dr: 2 },
  { name: "grass-water-corners", sheet: "terrain", c: 19, r: 6, w: 2, h: 2, dc: 12, dr: 2 },
  { name: "pond", sheet: "terrain", c: 0, r: 199, w: 3, h: 3, dc: 16, dr: 2 },
  // rows 6-9: road markings + water decor
  { name: "road-markings", sheet: "city", c: 4, r: 4, w: 8, h: 4, dc: 0, dr: 6 },
  { name: "water-decor", sheet: "terrain", c: 25, r: 5, w: 5, h: 3, dc: 10, dr: 6 },
  // rows 11-13: ground decor singles, dirt variants, flowers, fence
  { name: "grass-decals", sheet: "terrain", c: 25, r: 1, w: 3, h: 2, dc: 0, dr: 11 },
  { name: "dirt-variants", sheet: "terrain", c: 27, r: 3, w: 3, h: 1, dc: 4, dr: 11 },
  { name: "flowers", sheet: "houses", c: 18, r: 234, w: 6, h: 3, dc: 8, dr: 11 },
  { name: "fence", sheet: "terrain", c: 29, r: 9, w: 3, h: 3, dc: 16, dr: 11 },
  // rows 15-19: trees
  { name: "tree-medium", sheet: "houses", c: 12, r: 243, w: 4, h: 5, dc: 0, dr: 15 },
  // rows 21-33: house kits
  { name: "villa-brown", sheet: "houses", c: 0, r: 200, w: 8, h: 13, dc: 0, dr: 21 },
  { name: "villa-red", sheet: "houses", c: 0, r: 214, w: 8, h: 13, dc: 10, dr: 21 },
  { name: "villa-blue", sheet: "houses", c: 10, r: 214, w: 8, h: 13, dc: 20, dr: 21 },
  // rows 35-46: rounded-curb reference (roundabout + bus pads) — grab
  // quarter-arc corners from here as stamps for curved road turns
  { name: "road-curves", sheet: "city", c: 12, r: 8, w: 18, h: 12, dc: 0, dr: 35 },
];

// Wang sets (Tiled "Terrain Sets", corner type). Layout assumptions match
// SECTIONS above: blob = 3x3 at (bc,br), inner corners = 2x2 at (cc,cr)
// ordered [dot at BR, dot at BL / dot at TR, dot at TL].
const id = (c: number, r: number) => r * COLS + c;
function cornerWang(name: string, inner: string, outer: string, fillIn: [number, number], fillOut: [number, number], bc: number, br: number, cc: number, cr: number) {
  // wangid = T,TR,R,BR,B,BL,L,TL ; corner sets use indices 1,3,5,7 ; 1=inner 2=outer
  const w = (tr: number, brr: number, bl: number, tl: number, tile: number) =>
    `  <wangtile tileid="${tile}" wangid="0,${tr},0,${brr},0,${bl},0,${tl}"/>`;
  const rows = [
    ` <wangset name="${name}" type="corner" tile="-1">`,
    `  <wangcolor name="${inner}" color="#00ff00" tile="${id(...fillIn)}" probability="1"/>`,
    `  <wangcolor name="${outer}" color="#0000ff" tile="${id(...fillOut)}" probability="1"/>`,
    w(1, 1, 1, 1, id(...fillIn)),
    w(2, 2, 2, 2, id(...fillOut)),
    // 3x3 blob: outer corners / edges / fill
    w(2, 1, 2, 2, id(bc, br)), w(2, 1, 1, 2, id(bc + 1, br)), w(2, 2, 1, 2, id(bc + 2, br)),
    w(1, 1, 2, 2, id(bc, br + 1)), w(1, 1, 1, 1, id(bc + 1, br + 1)), w(2, 2, 1, 1, id(bc + 2, br + 1)),
    w(1, 2, 2, 2, id(bc, br + 2)), w(1, 2, 2, 1, id(bc + 1, br + 2)), w(2, 2, 2, 1, id(bc + 2, br + 2)),
    // inner corners: a single outer-color dot at one corner
    w(1, 2, 1, 1, id(cc, cr)), w(1, 1, 2, 1, id(cc + 1, cr)),
    w(2, 1, 1, 1, id(cc, cr + 1)), w(1, 1, 1, 2, id(cc + 1, cr + 1)),
    ` </wangset>`,
  ];
  return rows.join("\n");
}

async function main() {
  const comps: sharp.OverlayOptions[] = [];
  for (const s of SECTIONS) {
    comps.push({
      input: await sharp(SRC[s.sheet])
        .extract({ left: s.c * T, top: s.r * T, width: s.w * T, height: s.h * T })
        .toBuffer(),
      left: s.dc * T,
      top: s.dr * T,
    });
  }
  await sharp({ create: { width: COLS * T, height: ROWS * T, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(comps)
    .png()
    .toFile(`${TS}/composites/0_Working.png`);

  const wang = [
    cornerWang("Grass / Dirt", "grass", "dirt", [0, 0], [1, 0], 0, 2, 4, 2),
    cornerWang("Grass / Water", "grass", "water", [0, 0], [2, 0], 8, 2, 12, 2),
  ].join("\n");
  fs.writeFileSync(
    `${TS}/0_Working.tsx`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.11.0" name="0_Working" tilewidth="16" tileheight="16" tilecount="${COLS * ROWS}" columns="${COLS}">\n <image source="composites/0_Working.png" width="${COLS * T}" height="${ROWS * T}"/>\n <wangsets>\n${wang}\n </wangsets>\n</tileset>\n`
  );
  fs.writeFileSync(
    `${TS}/working-manifest.json`,
    JSON.stringify({ firstgid: FIRSTGID, columns: COLS, rows: ROWS, sections: SECTIONS }, null, 2)
  );
  console.log(`0_Working: ${COLS}x${ROWS} tiles, firstgid ${FIRSTGID}. Wrote PNG + .tsx (with terrain sets) + working-manifest.json`);
}

main();
