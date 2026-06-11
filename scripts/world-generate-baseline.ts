/**
 * Generates a baseline neighborhood layout into neighborhood.tmj:
 * ring road + sidewalks, central plaza + pond, 8 house plots, trees,
 * collision rects, and spawn points. Idempotent — rewrites all layers
 * from scratch each run; hand-edits in Tiled on top of the baseline
 * will be lost if re-run, so run once and then refine in Tiled.
 *
 *   npx tsx scripts/world-generate-baseline.ts
 *
 * Requires the composite tileset PNGs (npx tsx scripts/world-build-tilesets.ts).
 * Also writes a /tmp/map_preview.png render for eyeballing the result.
 *
 * Sheet coordinates below were identified visually from gridded crops of
 * the composite sheets (scripts/world-crop-tiles.mjs). Objects are stamped
 * with per-tile alpha checks, so rects only need to contain the object,
 * not match it exactly.
 */
import sharp from "sharp";
import fs from "node:fs";

const TS_DIR = "assets-src/runtime/world/tilesets/composites";
const MAP = "assets-src/runtime/world/maps/neighborhood.tmj";

const SHEETS = {
  terrain: { png: `${TS_DIR}/1_Terrain_and_Water.png`, firstgid: 1, cols: 32 },
  nature: { png: `${TS_DIR}/2_Nature_and_Outdoors.png`, firstgid: 6593, cols: 32 },
  city: { png: `${TS_DIR}/3_City_and_Streets.png`, firstgid: 19937, cols: 59 },
  houses: { png: `${TS_DIR}/4_Houses.png`, firstgid: 50322, cols: 32 },
} as const;
type SheetKey = keyof typeof SHEETS;

const W = 120, H = 80, T = 16;

// --- identified tiles (sheet col, row) ---
const GRASS = { sheet: "terrain" as SheetKey, c: 1, r: 7 }; // plain grass fill
const ASPHALT = { sheet: "city" as SheetKey, c: 0, r: 0 }; // plain road
const SIDEWALK = { sheet: "city" as SheetKey, c: 9, r: 1 }; // plain pavement
// 3x3 pond-on-grass autotile (animated water frame 0)
const POND9 = { sheet: "terrain" as SheetKey, c: 0, r: 199 };

// Objects: containing rect on the sheet; stamped via alpha-trim.
// doorDx = door column relative to trimmed left edge (for spawn points).
const OBJECTS = {
  villaBrown: { sheet: "houses", c: 0, r: 200, w: 10, h: 14, doorDx: 2 },
  villaRed: { sheet: "houses", c: 0, r: 214, w: 8, h: 13, doorDx: 3 },
  villaBlue: { sheet: "houses", c: 10, r: 214, w: 9, h: 13, doorDx: 3 },
  // the camping trees live at the bottom of the villas section of 4_Houses
  treeMedium: { sheet: "houses", c: 12, r: 243, w: 4, h: 5, doorDx: 0 },
} satisfies Record<string, { sheet: SheetKey; c: number; r: number; w: number; h: number; doorDx: number }>;

// --- layout ---
// Ring road bands (inclusive tile ranges)
const ROAD = { x0: 24, x1: 95, y0: 20, y1: 58, thick: 3 };
const PLAZA = { x0: 52, y0: 34, x1: 67, y1: 46 };
const POND = { x: 70, y: 38, w: 8, h: 6 };

// Houses: anchored by left edge + ground row (bottom of facade).
const PLOTS: { obj: keyof typeof OBJECTS; x: number; groundY: number }[] = [
  { obj: "villaBrown", x: 26, groundY: 17 },
  { obj: "villaRed", x: 38, groundY: 17 },
  { obj: "villaBlue", x: 48, groundY: 17 },
  { obj: "villaRed", x: 60, groundY: 17 },
  { obj: "villaBrown", x: 72, groundY: 17 },
  { obj: "villaBlue", x: 30, groundY: 53 },
  { obj: "villaRed", x: 44, groundY: 53 },
  { obj: "villaBrown", x: 80, groundY: 53 },
];
const TREES: { obj: keyof typeof OBJECTS; x: number; groundY: number }[] = [
  { obj: "treeMedium", x: 43, groundY: 36 },
  { obj: "treeMedium", x: 47, groundY: 31 },
  { obj: "treeMedium", x: 68, groundY: 35 },
  { obj: "treeMedium", x: 64, groundY: 52 },
  { obj: "treeMedium", x: 68, groundY: 16 },
  { obj: "treeMedium", x: 84, groundY: 15 },
  { obj: "treeMedium", x: 86, groundY: 30 },
];

// --- machinery ---
type Raw = { data: Buffer; width: number; height: number };
const raws: Partial<Record<SheetKey, Raw>> = {};
async function loadSheet(k: SheetKey): Promise<Raw> {
  if (!raws[k]) {
    const { data, info } = await sharp(SHEETS[k].png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    raws[k] = { data, width: info.width, height: info.height };
  }
  return raws[k]!;
}
function tileOpaque(raw: Raw, c: number, r: number): boolean {
  for (let y = 0; y < T; y++) {
    const base = ((r * T + y) * raw.width + c * T) * 4;
    for (let x = 0; x < T; x++) if (raw.data[base + x * 4 + 3] > 64) return true;
  }
  return false;
}
const gid = (k: SheetKey, c: number, r: number) => SHEETS[k].firstgid + r * SHEETS[k].cols + c;

const grids: Record<string, Uint32Array> = {};
for (const n of ["terrain-base", "terrain-roads-paths", "buildings", "props-solid"]) grids[n] = new Uint32Array(W * H);
const set = (layer: string, x: number, y: number, g: number) => {
  if (x >= 0 && x < W && y >= 0 && y < H) grids[layer][y * W + x] = g;
};
function fillRect(layer: string, x0: number, y0: number, x1: number, y1: number, k: SheetKey, c: number, r: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(layer, x, y, gid(k, c, r));
}
function nineSlice(layer: string, k: SheetKey, c0: number, r0: number, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const sc = c0 + (i === 0 ? 0 : i === w - 1 ? 2 : 1);
      const sr = r0 + (j === 0 ? 0 : j === h - 1 ? 2 : 1);
      set(layer, x + i, y + j, gid(k, sc, sr));
    }
}
// Stamp an object: alpha-trims the rect, anchors trimmed bottom-left at
// (x, groundY), copies only opaque tiles. Returns trimmed footprint.
async function stamp(layer: string, objKey: keyof typeof OBJECTS, x: number, groundY: number) {
  const o = OBJECTS[objKey];
  const raw = await loadSheet(o.sheet);
  const cells: { c: number; r: number }[] = [];
  for (let r = o.r; r < o.r + o.h; r++)
    for (let c = o.c; c < o.c + o.w; c++) if (tileOpaque(raw, c, r)) cells.push({ c, r });
  if (!cells.length) throw new Error(`${objKey}: rect is fully transparent`);
  const minC = Math.min(...cells.map((p) => p.c)), maxC = Math.max(...cells.map((p) => p.c));
  const minR = Math.min(...cells.map((p) => p.r)), maxR = Math.max(...cells.map((p) => p.r));
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const topY = groundY - h + 1;
  for (const p of cells) set(layer, x + (p.c - minC), topY + (p.r - minR), gid(o.sheet, p.c, p.r));
  return { x, y: topY, w, h, doorX: x + o.doorDx, trimmed: `${objKey} -> cols ${minC}-${maxC} rows ${minR}-${maxR}` };
}

async function main() {
  // terrain
  fillRect("terrain-base", 0, 0, W - 1, H - 1, GRASS.sheet, GRASS.c, GRASS.r);
  nineSlice("terrain-base", POND9.sheet, POND9.c, POND9.r, POND.x, POND.y, POND.w, POND.h);

  // ring road + sidewalks
  const { x0, x1, y0, y1, thick } = ROAD;
  const A = [ASPHALT.sheet, ASPHALT.c, ASPHALT.r] as const;
  const S = [SIDEWALK.sheet, SIDEWALK.c, SIDEWALK.r] as const;
  fillRect("terrain-roads-paths", x0 - 1, y0 - 1, x1 + 1, y1 + 1, ...S); // outer sidewalk + fill
  fillRect("terrain-roads-paths", x0, y0, x1, y1, ...A); // road block
  // hollow the middle back to nothing, leaving the ring + inner sidewalk
  const ix0 = x0 + thick, ix1 = x1 - thick, iy0 = y0 + thick, iy1 = y1 - thick;
  fillRect("terrain-roads-paths", ix0, iy0, ix1, iy1, ...S);
  for (let y = iy0 + 1; y <= iy1 - 1; y++)
    for (let x = ix0 + 1; x <= ix1 - 1; x++) grids["terrain-roads-paths"][y * W + x] = 0;
  // plaza + connector paths
  fillRect("terrain-roads-paths", PLAZA.x0, PLAZA.y0, PLAZA.x1, PLAZA.y1, ...S);
  fillRect("terrain-roads-paths", 58, iy0, 61, PLAZA.y0, ...S);
  fillRect("terrain-roads-paths", 58, PLAZA.y1, 61, iy1, ...S);

  // houses + spawns + collision
  const collision: { x: number; y: number; width: number; height: number }[] = [];
  const spawns: { name: string; x: number; y: number }[] = [];
  spawns.push({ name: "spawn", x: (PLAZA.x0 + PLAZA.x1 + 1) / 2 * T, y: (PLAZA.y0 + PLAZA.y1 + 1) / 2 * T });
  for (let i = 0; i < PLOTS.length; i++) {
    const f = await stamp("buildings", PLOTS[i].obj, PLOTS[i].x, PLOTS[i].groundY);
    console.log(f.trimmed);
    collision.push({ x: f.x * T, y: f.y * T, width: f.w * T, height: f.h * T });
    spawns.push({ name: `plot-${i + 1}-door`, x: (f.doorX + 0.5) * T, y: (PLOTS[i].groundY + 1.5) * T });
  }
  for (const t of TREES) {
    const f = await stamp("props-solid", t.obj, t.x, t.groundY);
    // collide on the trunk band only (bottom 2 rows, 1-col inset)
    collision.push({ x: (f.x + 1) * T, y: (f.y + f.h - 2) * T, width: (f.w - 2) * T, height: 2 * T });
  }
  collision.push({ x: POND.x * T, y: POND.y * T, width: POND.w * T, height: POND.h * T });
  // map border
  collision.push({ x: 0, y: -T, width: W * T, height: T });
  collision.push({ x: 0, y: H * T, width: W * T, height: T });
  collision.push({ x: -T, y: 0, width: T, height: H * T });
  collision.push({ x: W * T, y: 0, width: T, height: H * T });

  // write map
  const map = JSON.parse(fs.readFileSync(MAP, "utf8"));
  let oid = 1;
  for (const layer of map.layers) {
    if (layer.type === "tilelayer" && grids[layer.name]) layer.data = Array.from(grids[layer.name]);
    if (layer.name === "collision")
      layer.objects = collision.map((c) => ({ id: oid++, name: "", type: "", rotation: 0, visible: true, point: false, ...c }));
    if (layer.name === "spawns")
      layer.objects = spawns.map((s) => ({ id: oid++, type: "", rotation: 0, visible: true, point: true, width: 0, height: 0, ...s }));
  }
  map.nextobjectid = oid;
  fs.writeFileSync(MAP, JSON.stringify(map));
  console.log(`Wrote ${MAP}`);

  // render preview
  const out = Buffer.alloc(W * T * H * T * 4);
  for (const name of ["terrain-base", "terrain-roads-paths", "buildings", "props-solid"]) {
    const grid = grids[name];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const g = grid[y * W + x];
        if (!g) continue;
        const k = (Object.keys(SHEETS) as SheetKey[]).filter((s) => SHEETS[s].firstgid <= g).sort((a, b) => SHEETS[b].firstgid - SHEETS[a].firstgid)[0];
        const raw = await loadSheet(k);
        const local = g - SHEETS[k].firstgid;
        const sc = local % SHEETS[k].cols, sr = Math.floor(local / SHEETS[k].cols);
        for (let py = 0; py < T; py++)
          for (let px = 0; px < T; px++) {
            const si = ((sr * T + py) * raw.width + sc * T + px) * 4;
            if (raw.data[si + 3] > 64) {
              const di = ((y * T + py) * W * T + x * T + px) * 4;
              out[di] = raw.data[si]; out[di + 1] = raw.data[si + 1]; out[di + 2] = raw.data[si + 2]; out[di + 3] = 255;
            }
          }
      }
  }
  await sharp(out, { raw: { width: W * T, height: H * T, channels: 4 } }).png().toFile("/tmp/map_preview.png");
  console.log("Preview: /tmp/map_preview.png");
}

main();
