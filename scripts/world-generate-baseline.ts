/**
 * Generates a baseline neighborhood layout into neighborhood.tmj:
 * ring road + sidewalks, central plaza + pond, 8 house plots, trees,
 * collision rects, and spawn points. Idempotent — rewrites all layers
 * from scratch each run; hand-edits in Tiled on top of the baseline
 * will be lost if re-run, so run once and then refine in Tiled.
 *
 *   npx tsx scripts/world-generate-baseline.ts
 *
 * Paints from the 0_Working tileset (run world-build-tilesets.ts then
 * world-build-working-tileset.ts first) so the Terrain Brush recognizes
 * the placed tiles. Writes the 3-layer contract (ground/props/overhead
 * + collision/spawns) and renders /tmp/map_preview.png for eyeballing.
 */
import sharp from "sharp";
import fs from "node:fs";

const TS_DIR = "assets-src/runtime/world/tilesets";
const MAP = "assets-src/runtime/world/maps/neighborhood.tmj";
const WORKING = JSON.parse(fs.readFileSync(`${TS_DIR}/working-manifest.json`, "utf8"));

const SHEET = { png: `${TS_DIR}/composites/0_Working.png`, firstgid: WORKING.firstgid as number, cols: WORKING.columns as number };
const W = 120, H = 80, T = 16;

// --- tiles, by 0_Working sheet position (see working-manifest.json) ---
const GRASS = { c: 0, r: 0 };
const SIDEWALK = { c: 3, r: 0 };
const ASPHALT = { c: 4, r: 0 };
const POND9 = { c: 16, r: 2 }; // 3x3 pond-on-grass autotile, frame 0

// Objects: rect on the working sheet, stamped via per-tile alpha checks.
// doorDx = door column relative to trimmed left edge (for spawn points).
const OBJECTS = {
  villaBrown: { c: 0, r: 21, w: 8, h: 13, doorDx: 2 },
  villaRed: { c: 10, r: 21, w: 8, h: 13, doorDx: 3 },
  villaBlue: { c: 20, r: 21, w: 8, h: 13, doorDx: 3 },
  treeMedium: { c: 0, r: 15, w: 4, h: 5, doorDx: 0 },
} satisfies Record<string, { c: number; r: number; w: number; h: number; doorDx: number }>;

// --- layout ---
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
let raw: { data: Buffer; width: number } | null = null;
async function sheetRaw() {
  if (!raw) {
    const { data, info } = await sharp(SHEET.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    raw = { data, width: info.width };
  }
  return raw;
}
function tileOpaque(rw: { data: Buffer; width: number }, c: number, r: number): boolean {
  for (let y = 0; y < T; y++) {
    const base = ((r * T + y) * rw.width + c * T) * 4;
    for (let x = 0; x < T; x++) if (rw.data[base + x * 4 + 3] > 64) return true;
  }
  return false;
}
const gid = (c: number, r: number) => SHEET.firstgid + r * SHEET.cols + c;

const grids: Record<string, Uint32Array> = { ground: new Uint32Array(W * H), props: new Uint32Array(W * H), overhead: new Uint32Array(W * H) };
const set = (layer: string, x: number, y: number, g: number) => {
  if (x >= 0 && x < W && y >= 0 && y < H) grids[layer][y * W + x] = g;
};
function fillRect(layer: string, x0: number, y0: number, x1: number, y1: number, t: { c: number; r: number }) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(layer, x, y, gid(t.c, t.r));
}
function nineSlice(layer: string, t: { c: number; r: number }, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      set(layer, x + i, y + j, gid(t.c + (i === 0 ? 0 : i === w - 1 ? 2 : 1), t.r + (j === 0 ? 0 : j === h - 1 ? 2 : 1)));
}
// Stamp an object: alpha-trims the rect, anchors trimmed bottom-left at
// (x, groundY), copies only opaque tiles. Returns trimmed footprint.
async function stamp(layer: string, objKey: keyof typeof OBJECTS, x: number, groundY: number) {
  const o = OBJECTS[objKey];
  const rw = await sheetRaw();
  const cells: { c: number; r: number }[] = [];
  for (let r = o.r; r < o.r + o.h; r++)
    for (let c = o.c; c < o.c + o.w; c++) if (tileOpaque(rw, c, r)) cells.push({ c, r });
  if (!cells.length) throw new Error(`${objKey}: rect is fully transparent`);
  const minC = Math.min(...cells.map((p) => p.c)), maxC = Math.max(...cells.map((p) => p.c));
  const minR = Math.min(...cells.map((p) => p.r)), maxR = Math.max(...cells.map((p) => p.r));
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const topY = groundY - h + 1;
  for (const p of cells) set(layer, x + (p.c - minC), topY + (p.r - minR), gid(p.c, p.r));
  return { x, y: topY, w, h, doorX: x + o.doorDx };
}

async function main() {
  // terrain
  fillRect("ground", 0, 0, W - 1, H - 1, GRASS);

  // ring road + sidewalks
  const { x0, x1, y0, y1, thick } = ROAD;
  fillRect("ground", x0 - 1, y0 - 1, x1 + 1, y1 + 1, SIDEWALK);
  fillRect("ground", x0, y0, x1, y1, ASPHALT);
  const ix0 = x0 + thick, ix1 = x1 - thick, iy0 = y0 + thick, iy1 = y1 - thick;
  fillRect("ground", ix0, iy0, ix1, iy1, SIDEWALK);
  fillRect("ground", ix0 + 1, iy0 + 1, ix1 - 1, iy1 - 1, GRASS); // hollow the middle
  // plaza + connector paths
  fillRect("ground", PLAZA.x0, PLAZA.y0, PLAZA.x1, PLAZA.y1, SIDEWALK);
  fillRect("ground", 58, iy0, 61, PLAZA.y0, SIDEWALK);
  fillRect("ground", 58, PLAZA.y1, 61, iy1, SIDEWALK);
  // pond last — everything shares the ground layer, so paint order matters
  nineSlice("ground", POND9, POND.x, POND.y, POND.w, POND.h);

  // houses + trees + spawns + collision
  const collision: { x: number; y: number; width: number; height: number }[] = [];
  const spawns: { name: string; x: number; y: number }[] = [];
  spawns.push({ name: "spawn", x: ((PLAZA.x0 + PLAZA.x1 + 1) / 2) * T, y: ((PLAZA.y0 + PLAZA.y1 + 1) / 2) * T });
  for (let i = 0; i < PLOTS.length; i++) {
    const f = await stamp("props", PLOTS[i].obj, PLOTS[i].x, PLOTS[i].groundY);
    collision.push({ x: f.x * T, y: f.y * T, width: f.w * T, height: f.h * T });
    spawns.push({ name: `plot-${i + 1}-door`, x: (f.doorX + 0.5) * T, y: (PLOTS[i].groundY + 1.5) * T });
  }
  for (const t of TREES) {
    const f = await stamp("props", t.obj, t.x, t.groundY);
    collision.push({ x: (f.x + 1) * T, y: (f.y + f.h - 2) * T, width: (f.w - 2) * T, height: 2 * T });
  }
  collision.push({ x: POND.x * T, y: POND.y * T, width: POND.w * T, height: POND.h * T });
  collision.push({ x: 0, y: -T, width: W * T, height: T });
  collision.push({ x: 0, y: H * T, width: W * T, height: T });
  collision.push({ x: -T, y: 0, width: T, height: H * T });
  collision.push({ x: W * T, y: 0, width: T, height: H * T });

  // write map: layer contract v3 (ground/props/overhead + collision/spawns)
  const map = JSON.parse(fs.readFileSync(MAP, "utf8"));
  if (!map.tilesets.some((t: { source?: string }) => t.source?.includes("0_Working")))
    map.tilesets.push({ firstgid: SHEET.firstgid, source: "../tilesets/0_Working.tsx" });
  let oid = 1, lid = 1;
  const tileLayer = (name: string) => ({
    id: lid++, name, type: "tilelayer", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true,
    data: Array.from(grids[name]),
  });
  map.layers = [
    tileLayer("ground"),
    tileLayer("props"),
    tileLayer("overhead"),
    {
      id: lid++, name: "collision", type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true,
      objects: collision.map((c) => ({ id: oid++, name: "", type: "", rotation: 0, visible: true, point: false, ...c })),
    },
    {
      id: lid++, name: "spawns", type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true,
      objects: spawns.map((s) => ({ id: oid++, type: "", rotation: 0, visible: true, point: true, width: 0, height: 0, ...s })),
    },
  ];
  map.nextlayerid = lid;
  map.nextobjectid = oid;
  fs.writeFileSync(MAP, JSON.stringify(map));
  console.log(`Wrote ${MAP} (3-layer contract, 0_Working gids)`);

  // render preview
  const rw = await sheetRaw();
  const out = Buffer.alloc(W * T * H * T * 4);
  for (const name of ["ground", "props", "overhead"]) {
    const grid = grids[name];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const g = grid[y * W + x];
        if (!g) continue;
        const local = g - SHEET.firstgid;
        const sc = local % SHEET.cols, sr = Math.floor(local / SHEET.cols);
        for (let py = 0; py < T; py++)
          for (let px = 0; px < T; px++) {
            const si = ((sr * T + py) * rw.width + sc * T + px) * 4;
            if (rw.data[si + 3] > 64) {
              const di = ((y * T + py) * W * T + x * T + px) * 4;
              out[di] = rw.data[si]; out[di + 1] = rw.data[si + 1]; out[di + 2] = rw.data[si + 2]; out[di + 3] = 255;
            }
          }
      }
  }
  await sharp(out, { raw: { width: W * T, height: H * T, channels: 4 } }).png().toFile("/tmp/map_preview.png");
  console.log("Preview: /tmp/map_preview.png");
}

main();
