/**
 * world-import-design — turn one of LimeZu's pre-made interior scenes
 * (assets-src/modern-interiors/6_Home_Designs/**, 16x16 layered PNGs)
 * into a real, editable Tiled map: every 16px cell of the design is
 * matched back to the actual tile in the I1–I6 tilesets, so you get
 * normal tile layers you can erase/repaint — not a baked image.
 *
 *   npm run world:import-design -- --list            (see design keys)
 *   npm run world:import-design -- <map-id> --design <designKey> [--label "Name"]
 *   npm run world:import-design -- my-gym --design gym --label "The Gym"
 *
 * What you get (same contract as world-new-map, ready to ship):
 *   - tile layers subfloor/floor/props/overhead; design layer 1 → floor,
 *     layer 2 → props, layer 3 → overhead
 *   - collision border, "spawn" point at center, empty npcs/portals —
 *     YOU then adjust collision/spawn/portals in Tiled
 *   - any design cells that don't exactly match a tileset tile (stacked
 *     composites etc.) are packed into a per-map "<id>-extra" tileset so
 *     nothing is lost visually
 *   - auto-registered in MAP_REGISTRY
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const PACK_DIR = "assets-src/modern-interiors/6_Home_Designs";
const TILESETS_DIR = "assets-src/runtime/world/tilesets";
const MAPS_DIR = "assets-src/runtime/world/maps";
const REGISTRY = "src/modules/world/maps.ts";
const TILE = 16;

// Same lineup/firstgids as world-new-map so gids match across maps.
const INTERIOR_TILESETS: [number, string][] = [
  [1, "I1_Room_Builder"],
  [8969, "I2_Generic_and_Living"],
  [11241, "I3_Kitchen_Bath_Bedroom"],
  [14633, "I4_Work_and_Civic"],
  [18281, "I5_Shops_and_Studios"],
  [23049, "I6_Hobby_and_Seasonal"],
];
// I6 ends at 23049 + 4592 = 27641; the per-map extra tileset sits above.
const EXTRA_FIRSTGID = 28000;

// ── design discovery ────────────────────────────────────────────────────

type Design = { key: string; name: string; folder: string; layers: string[]; preview?: string };

function discoverDesigns(): Design[] {
  const designs = new Map<string, Design>();
  for (const folder of fs.readdirSync(PACK_DIR)) {
    const dir = path.join(PACK_DIR, folder, "16x16");
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith(".png")) continue;
      // e.g. Gym_layer_1.png / Generic_Home_1_Layer_2_.png / Japanese_Home_1_Layer_1_16x16.png
      const m = file.match(/^(.*?)_layer_?(\d+)_?(?:16x16)?\.png$/i);
      if (!m) {
        if (/preview/i.test(file)) {
          const base = file.replace(/_preview.*$/i, "");
          const key = slug(base);
          const d = designs.get(key);
          if (d) d.preview = path.join(dir, file);
          else designs.set(key, { key, name: pretty(base), folder, layers: [], preview: path.join(dir, file) });
        }
        continue;
      }
      const key = slug(m[1]);
      const d =
        designs.get(key) ?? { key, name: pretty(m[1]), folder, layers: [] as string[] };
      d.layers[Number(m[2]) - 1] = path.join(dir, file);
      designs.set(key, d);
    }
  }
  return [...designs.values()]
    .filter((d) => d.layers.length > 0 && d.layers.every(Boolean))
    .sort((a, b) => a.key.localeCompare(b.key));
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pretty = (s: string) => s.replace(/_+/g, " ").trim();

// ── pixel plumbing ──────────────────────────────────────────────────────

type Img = { data: Buffer; width: number; height: number };

async function loadImg(file: string): Promise<Img> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Extract one 16x16 RGBA cell starting at (px, py); out-of-bounds pixels
 * read as transparent. Transparent pixels are normalized to 0,0,0,0 so
 * stray RGB under alpha=0 never breaks an exact match.
 */
function cell(img: Img, px: number, py: number): Buffer {
  const out = Buffer.alloc(TILE * TILE * 4);
  for (let dy = 0; dy < TILE; dy++) {
    const sy = py + dy;
    if (sy < 0 || sy >= img.height) continue;
    for (let dx = 0; dx < TILE; dx++) {
      const sx = px + dx;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const a = img.data[si + 3];
      if (a === 0) continue;
      const di = (dy * TILE + dx) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = a;
    }
  }
  return out;
}

const EMPTY_KEY = Buffer.alloc(TILE * TILE * 4).toString("latin1");
const key = (b: Buffer) => b.toString("latin1");

/** gid for every exact-match 16x16 cell across the interior tilesets. */
async function buildTileIndex(): Promise<Map<string, number>> {
  const index = new Map<string, number>();
  for (const [firstgid, name] of INTERIOR_TILESETS) {
    const tsx = fs.readFileSync(path.join(TILESETS_DIR, `${name}.tsx`), "utf8");
    const imgSrc = tsx.match(/<image source="([^"]+)"/)![1];
    const img = await loadImg(path.join(TILESETS_DIR, imgSrc));
    const cols = img.width / TILE;
    const rows = img.height / TILE;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = key(cell(img, c * TILE, r * TILE));
        if (k === EMPTY_KEY) continue;
        // first tileset wins on duplicate art — keeps gids low/stable
        if (!index.has(k)) index.set(k, firstgid + r * cols + c);
      }
    }
  }
  return index;
}

// ── main ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const designs = discoverDesigns();

if (args.includes("--list")) {
  if (args.includes("--json")) {
    console.log(JSON.stringify({ designs: designs.map(({ key: k, name, folder, layers }) => ({ key: k, name, folder, layers: layers.length })) }));
  } else {
    for (const d of designs) console.log(`${d.key.padEnd(28)} ${d.layers.length} layer(s)  [${d.folder}]`);
  }
  process.exit(0);
}

const id = args[0];
const designKey = opt("design");
const design = designs.find((d) => d.key === designKey);
if (!id || !/^[a-z0-9-]+$/.test(id) || !design) {
  console.error('Usage: npm run world:import-design -- <map-id (kebab-case)> --design <key> [--label "Name"]');
  console.error("Run with --list to see available design keys.");
  process.exit(1);
}
const label = opt("label") ?? design.name;

const tmxPath = path.join(MAPS_DIR, `${id}.tmx`);
if (fs.existsSync(tmxPath)) {
  console.error(`${tmxPath} already exists — pick another id.`);
  process.exit(1);
}
const registrySrc = fs.readFileSync(REGISTRY, "utf8");
if (registrySrc.includes(`id: "${id}"`)) {
  console.error(`"${id}" is already in MAP_REGISTRY — pick another id.`);
  process.exit(1);
}

(async () => {
  console.log(`Indexing interior tilesets…`);
  const index = await buildTileIndex();
  console.log(`  ${index.size} unique tiles indexed`);

  const layerImgs = await Promise.all(design.layers.map(loadImg));
  const pxW = Math.max(...layerImgs.map((i) => i.width));
  const pxH = Math.max(...layerImgs.map((i) => i.height));
  const w = Math.ceil(pxW / TILE);
  const h = Math.ceil(pxH / TILE);

  // Design PNGs aren't always 16px multiples — find the grid alignment
  // (anchor left/right, top/bottom) that matches the most tiles.
  const padX = (TILE - (pxW % TILE)) % TILE;
  const padY = (TILE - (pxH % TILE)) % TILE;
  let best = { ox: 0, oy: 0, score: -1 };
  for (const ox of padX ? [0, -padX] : [0]) {
    for (const oy of padY ? [0, -padY] : [0]) {
      let score = 0;
      for (const img of layerImgs) {
        for (let ty = 0; ty < h; ty++) {
          for (let tx = 0; tx < w; tx++) {
            const k = key(cell(img, tx * TILE + ox, ty * TILE + oy));
            if (k !== EMPTY_KEY && index.has(k)) score++;
          }
        }
      }
      if (score > best.score) best = { ox, oy, score };
    }
  }

  // Convert each design layer to gids; unmatched cells become new tiles
  // in the per-map extra tileset.
  const extraTiles: Buffer[] = [];
  const extraIndex = new Map<string, number>();
  let matched = 0;
  let unmatched = 0;
  const grids = layerImgs.map((img) => {
    const grid = new Array<number>(w * h).fill(0);
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const c = cell(img, tx * TILE + best.ox, ty * TILE + best.oy);
        const k = key(c);
        if (k === EMPTY_KEY) continue;
        const gid = index.get(k);
        if (gid) {
          grid[ty * w + tx] = gid;
          matched++;
        } else {
          let extra = extraIndex.get(k);
          if (!extra) {
            extraTiles.push(c);
            extra = EXTRA_FIRSTGID + extraTiles.length - 1;
            extraIndex.set(k, extra);
          }
          grid[ty * w + tx] = extra;
          unmatched++;
        }
      }
    }
    return grid;
  });
  console.log(
    `Matched ${matched}/${matched + unmatched} painted cells to tileset tiles` +
      (unmatched ? ` (${extraTiles.length} unique leftovers → ${id}-extra tileset)` : "")
  );

  // ── extra tileset (only if needed) ────────────────────────────────────
  let extraTsx = "";
  if (extraTiles.length) {
    const cols = Math.min(16, extraTiles.length);
    const rows = Math.ceil(extraTiles.length / cols);
    const png = await sharp({
      create: { width: cols * TILE, height: rows * TILE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(
        extraTiles.map((buf, i) => ({
          input: buf,
          raw: { width: TILE, height: TILE, channels: 4 },
          left: (i % cols) * TILE,
          top: Math.floor(i / cols) * TILE,
        }))
      )
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(MAPS_DIR, `${id}-extra.png`), png);
    fs.writeFileSync(
      path.join(MAPS_DIR, `${id}-extra.tsx`),
      `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.0" name="${id}-extra" tilewidth="16" tileheight="16" tilecount="${extraTiles.length}" columns="${cols}">
 <image source="${id}-extra.png" width="${cols * TILE}" height="${rows * TILE}"/>
</tileset>
`
    );
    extraTsx = ` <tileset firstgid="${EXTRA_FIRSTGID}" source="${id}-extra.tsx"/>\n`;
  }

  // ── assemble the .tmx (same contract as world-new-map) ────────────────
  // design layer 1 → floor, 2 → props, 3 → overhead; subfloor always
  // present, overhead always present (empty if the design has no layer 3).
  const emptyGrid = new Array<number>(w * h).fill(0);
  const named: [string, number[]][] = [
    ["subfloor", emptyGrid],
    ["floor", grids[0] ?? emptyGrid],
    ["props", grids[1] ?? emptyGrid],
    ["overhead", grids[2] ?? emptyGrid],
  ];

  const csv = (grid: number[]) =>
    Array.from({ length: h }, (_, ty) => grid.slice(ty * w, (ty + 1) * w).join(",")).join(",\n");

  let layerId = 1;
  let objectId = 1;
  const tileLayers = named
    .map(
      ([name, grid]) => ` <layer id="${layerId++}" name="${name}" width="${w}" height="${h}">
  <data encoding="csv">
${csv(grid)}
</data>
 </layer>`
    )
    .join("\n");

  const W = w * TILE;
  const H = h * TILE;
  const border = [
    [0, 0, W, TILE],
    [0, H - TILE, W, TILE],
    [0, TILE, TILE, H - 2 * TILE],
    [W - TILE, TILE, TILE, H - 2 * TILE],
  ]
    .map(([x, y, bw, bh]) => `  <object id="${objectId++}" x="${x}" y="${y}" width="${bw}" height="${bh}"/>`)
    .join("\n");

  const spawnId = objectId++;
  const objectLayers = ` <objectgroup id="${layerId++}" name="collision">
${border}
 </objectgroup>
 <objectgroup id="${layerId++}" name="spawns">
  <object id="${spawnId}" name="spawn" x="${((W / 2) & ~15) | 8}" y="${((H / 2) & ~15) | 12}">
   <point/>
  </object>
 </objectgroup>
 <objectgroup id="${layerId++}" name="npcs"/>
 <objectgroup id="${layerId++}" name="portals"/>`;

  const tilesets =
    INTERIOR_TILESETS.map(([gid, name]) => ` <tileset firstgid="${gid}" source="../tilesets/${name}.tsx"/>`).join(
      "\n"
    ) + (extraTsx ? `\n${extraTsx.trimEnd()}` : "");

  const tmx = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.11" tiledversion="1.12.2" orientation="orthogonal" renderorder="right-down" width="${w}" height="${h}" tilewidth="16" tileheight="16" infinite="0" nextlayerid="${layerId}" nextobjectid="${objectId}">
${tilesets}
${tileLayers}
${objectLayers}
</map>
`;
  fs.writeFileSync(tmxPath, tmx);

  const entry = `  {
    id: "${id}",
    tmx: "${tmxPath}",
    label: ${JSON.stringify(label)},
    kind: "interior",
  },
];`;
  fs.writeFileSync(REGISTRY, registrySrc.replace(/\];\s*$/, entry + "\n"));

  console.log(`✔ created ${tmxPath} (${w}x${h} interior, from design "${design.key}")`);
  console.log(`✔ registered "${id}" in ${REGISTRY}`);
  console.log(`
Next:
  1. Open it in Tiled (World Studio does this for you).
  2. The pre-made scene is on floor/props/overhead as real tiles — erase,
     repaint, extend; it's all normal tile editing.
  3. Add your own collision rects (only the map border is pre-drawn),
     move the "spawn" point, draw portal rects.
  4. Ship from World Studio when happy.`);
})();
