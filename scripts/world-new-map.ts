/**
 * world-new-map — scaffold a ready-to-paint Tiled map with the layer
 * contract pre-built, the right tilesets pre-loaded, and the map
 * auto-registered in MAP_REGISTRY. Kills the two classic mistakes:
 * building inside the template, and hand-naming layers wrong.
 *
 *   npm run world:new-map -- <map-id> --kind interior [--size 40x30] [--label "Nice Name"]
 *   npm run world:new-map -- cafe-interior --kind interior --label "The Cafe"
 *   npm run world:new-map -- east-side --kind exterior --size 60x60
 *
 * What you get (open it in Tiled and just paint):
 *   - tile layers, bottom→top: interior subfloor/floor/props/overhead,
 *     exterior ground/props/overhead (exterior ground pre-filled grass)
 *   - object layers: collision (map border pre-drawn), spawns (a point
 *     named "spawn" at the center), npcs (empty), portals (empty)
 *   - all I1–I6 (interior) or exterior tilesets at the standard firstgids
 *
 * After painting, hand off to Claude — portals/doors get wired during
 * the export/ship step (see /world/admin → Runbooks).
 */
import fs from "node:fs";
import path from "node:path";

const MAPS_DIR = "assets-src/runtime/world/maps";
const REGISTRY = "src/modules/world/maps.ts";

// Tileset lineups (firstgids match the existing maps so gids stay
// comparable across the project).
const TILESETS: Record<string, [number, string][]> = {
  interior: [
    [1, "I1_Room_Builder"],
    [8969, "I2_Generic_and_Living"],
    [11241, "I3_Kitchen_Bath_Bedroom"],
    [14633, "I4_Work_and_Civic"],
    [18281, "I5_Shops_and_Studios"],
    [23049, "I6_Hobby_and_Seasonal"],
  ],
  exterior: [
    [1, "1_Terrain_and_Water"],
    [6593, "4_Houses"],
    [32961, "0_Working"],
    [34465, "2_Nature_and_Outdoors"],
    [47809, "5_Civic_and_Shops"],
    [64342, "3_City_and_Streets"],
  ],
};
const TILE_LAYERS: Record<string, string[]> = {
  interior: ["subfloor", "floor", "props", "overhead"],
  exterior: ["ground", "props", "overhead"],
};
const DEFAULT_SIZE: Record<string, [number, number]> = {
  interior: [40, 30],
  exterior: [50, 50],
};
// Plain grass fill (1_Terrain_and_Water) for exterior ground so new
// outdoor maps start walkable instead of void.
const GRASS_GID = 226;

// ── args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const id = args[0];
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const kind = opt("kind");
if (!id || !/^[a-z0-9-]+$/.test(id) || !kind || !TILESETS[kind]) {
  console.error(
    "Usage: npm run world:new-map -- <map-id (kebab-case)> --kind interior|exterior [--size WxH] [--label \"Name\"]"
  );
  process.exit(1);
}
const label = opt("label") ?? id;
const [w, h] = (opt("size") ?? DEFAULT_SIZE[kind].join("x")).split("x").map(Number);
if (!w || !h) {
  console.error(`Bad --size (want e.g. 40x30)`);
  process.exit(1);
}

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

// ── build the .tmx ──────────────────────────────────────────────────────
const csvRow = (gid: number) => Array(w).fill(gid).join(",");
const csv = (gid: number) => Array(h).fill(csvRow(gid)).join(",\n");

let layerId = 1;
let objectId = 1;
const tileLayers = TILE_LAYERS[kind]
  .map((name) => {
    const fill = kind === "exterior" && name === "ground" ? GRASS_GID : 0;
    return ` <layer id="${layerId++}" name="${name}" width="${w}" height="${h}">
  <data encoding="csv">
${csv(fill)}
</data>
 </layer>`;
  })
  .join("\n");

// collision border: four rects fencing the map edge
const W = w * 16;
const H = h * 16;
const border = [
  [0, 0, W, 16],
  [0, H - 16, W, 16],
  [0, 16, 16, H - 32],
  [W - 16, 16, 16, H - 32],
]
  .map(([x, y, bw, bh]) => `  <object id="${objectId++}" x="${x}" y="${y}" width="${bw}" height="${bh}"/>`)
  .join("\n");

const spawnId = objectId++;
const objectLayers = ` <objectgroup id="${layerId++}" name="collision">
${border}
 </objectgroup>
 <objectgroup id="${layerId++}" name="spawns">
  <object id="${spawnId}" name="spawn" x="${(W / 2) & ~15 | 8}" y="${(H / 2) & ~15 | 12}">
   <point/>
  </object>
 </objectgroup>
 <objectgroup id="${layerId++}" name="npcs"/>
 <objectgroup id="${layerId++}" name="portals"/>`;

const tilesets = TILESETS[kind]
  .map(([gid, name]) => ` <tileset firstgid="${gid}" source="../tilesets/${name}.tsx"/>`)
  .join("\n");

const tmx = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.11" tiledversion="1.12.2" orientation="orthogonal" renderorder="right-down" width="${w}" height="${h}" tilewidth="16" tileheight="16" infinite="0" nextlayerid="${layerId}" nextobjectid="${objectId}">
${tilesets}
${tileLayers}
${objectLayers}
</map>
`;
fs.writeFileSync(tmxPath, tmx);

// ── auto-register in MAP_REGISTRY ───────────────────────────────────────
const entry = `  {
    id: "${id}",
    tmx: "${tmxPath}",
    label: ${JSON.stringify(label)},
    kind: "${kind}",
  },
];`;
fs.writeFileSync(REGISTRY, registrySrc.replace(/\];\s*$/, entry + "\n"));

console.log(`✔ created ${tmxPath} (${w}x${h} ${kind})`);
console.log(`✔ registered "${id}" in ${REGISTRY}`);
console.log(`
Next:
  1. Open assets-src/world.tiled-project in Tiled → maps/${id}.tmx
  2. Paint. Layers + tilesets are ready; collision border, "spawn"
     point, and empty npcs/portals layers already exist.
  3. Hand off: tell Claude "${id} is painted — door connects to <where>".`);
