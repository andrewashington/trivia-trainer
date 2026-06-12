/**
 * Exports every Tiled authoring map into the engine-ready bundle the
 * /world route loads via /api/world/assets:
 *
 *   assets-src/runtime/world/maps-json/<id>.json   Tiled-JSON map per map id
 *   assets-src/runtime/world/map.json              legacy copy of "neighborhood"
 *   assets-src/runtime/world/tiles/<name>.png      one image per tileset actually used
 *
 * To add a map: save the .tmx under assets-src/runtime/world/maps/ and
 * register it in MAP_REGISTRY (src/modules/world/maps.ts) — its id is
 * used by portals and presence rooms. Re-run after every Tiled editing
 * session, then sync to S3 for prod:
 *   npx tsx scripts/world-export-map.ts
 *   railway run npx tsx scripts/world-sync-assets.ts
 *
 * Only tilesets that contribute at least one painted tile are embedded, so
 * the client never downloads unused mega-sheets. Flip flags in gids pass
 * through untouched (Phaser honors them).
 */
import fs from "node:fs";
import path from "node:path";

import { MAP_REGISTRY } from "../src/modules/world/maps";

const OUT_DIR = "assets-src/runtime/world";
const GID_FLAGS = 0x1fffffff; // mask off flip bits when range-checking

const attr = (s: string, name: string) => {
  const m = s.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

type TsRef = {
  firstgid: number;
  name: string;
  columns: number;
  tilecount: number;
  imagePath: string; // on-disk source of the PNG
  imageW: number;
  imageH: number;
};

function exportMap(mapId: string, mapSrc: string) {
  const xml = fs.readFileSync(mapSrc, "utf8");

  const mapAttrs = xml.match(/<map ([^>]+)>/)![1];
  const mapW = Number(attr(mapAttrs, "width"));
  const mapH = Number(attr(mapAttrs, "height"));

  // ── Tilesets referenced by the map (external .tsx or embedded) ────────
  const tilesets: TsRef[] = [];
  for (const m of xml.matchAll(/<tileset ([^>]*?)(?:\/>|>([\s\S]*?)<\/tileset>)/g)) {
    const firstgid = Number(attr(m[1], "firstgid"));
    const source = attr(m[1], "source");
    if (source) {
      const tsxPath = path.join(path.dirname(mapSrc), source);
      const tsx = fs.readFileSync(tsxPath, "utf8");
      const tsAttrs = tsx.match(/<tileset ([^>]+)>/)![1];
      const img = tsx.match(/<image ([^>]+)\/>/)![1];
      tilesets.push({
        firstgid,
        name: attr(tsAttrs, "name")!,
        columns: Number(attr(tsAttrs, "columns")),
        tilecount: Number(attr(tsAttrs, "tilecount")),
        imagePath: path.join(path.dirname(tsxPath), attr(img, "source")!),
        imageW: Number(attr(img, "width")),
        imageH: Number(attr(img, "height")),
      });
    } else {
      // tileset embedded directly in the .tmx
      const img = m[2]!.match(/<image ([^>]+)\/>/)![1];
      tilesets.push({
        firstgid,
        name: attr(m[1], "name")!,
        columns: Number(attr(m[1], "columns")),
        tilecount: Number(attr(m[1], "tilecount")),
        imagePath: path.join(path.dirname(mapSrc), attr(img, "source")!),
        imageW: Number(attr(img, "width")),
        imageH: Number(attr(img, "height")),
      });
    }
  }
  tilesets.sort((a, b) => a.firstgid - b.firstgid);

  // ── Layers ─────────────────────────────────────────────────────────────
  type AnyLayer = Record<string, unknown>;
  const layers: AnyLayer[] = [];
  let layerId = 1;
  const usedGids = new Set<number>();

  for (const m of xml.matchAll(
    /<layer [^>]*name="([^"]+)"[^>]*>[\s\S]*?<data encoding="csv">([\s\S]*?)<\/data>[\s\S]*?<\/layer>/g
  )) {
    const data = m[2]
      .trim()
      .split(",")
      .map((s) => Number(s.trim()));
    for (const g of data) if (g) usedGids.add(g & GID_FLAGS);
    layers.push({
      id: layerId++,
      name: m[1],
      type: "tilelayer",
      width: mapW,
      height: mapH,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data,
    });
  }

  for (const m of xml.matchAll(/<objectgroup [^>]*name="([^"]+)"[^>]*(?:\/>|>([\s\S]*?)<\/objectgroup>)/g)) {
    const objects: AnyLayer[] = [];
    for (const o of [...(m[2] ?? "").matchAll(/<object ([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g)]) {
      objects.push({
        id: Number(attr(o[1], "id")),
        name: attr(o[1], "name") ?? "",
        // Tiled ≥1.9 writes the object's Class as class=, older as type=
        type: attr(o[1], "type") ?? attr(o[1], "class") ?? "",
        x: Number(attr(o[1], "x") ?? 0),
        y: Number(attr(o[1], "y") ?? 0),
        width: Number(attr(o[1], "width") ?? 0),
        height: Number(attr(o[1], "height") ?? 0),
        rotation: Number(attr(o[1], "rotation") ?? 0),
        visible: true,
        point: (o[2] ?? "").includes("<point"),
      });
    }
    layers.push({
      id: layerId++,
      name: m[1],
      type: "objectgroup",
      draworder: "topdown",
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects,
    });
  }

  // ── De-dup tilesets by name (e.g. an accidentally embedded copy of an
  // external sheet) and REMAP gids painted from the dropped copy onto the
  // kept one — local tile ids are identical since it's the same image.
  const keptByName = new Map<string, TsRef>();
  for (const ts of tilesets) if (!keptByName.has(ts.name)) keptByName.set(ts.name, ts);
  const remaps = tilesets
    .filter((ts) => keptByName.get(ts.name) !== ts)
    .map((ts) => ({
      lo: ts.firstgid,
      hi: ts.firstgid + ts.tilecount,
      delta: keptByName.get(ts.name)!.firstgid - ts.firstgid,
    }));
  if (remaps.length) {
    usedGids.clear();
    for (const layer of layers) {
      if (layer.type !== "tilelayer") continue;
      const data = layer.data as number[];
      for (let i = 0; i < data.length; i++) {
        const flags = data[i] & ~GID_FLAGS;
        let base = data[i] & GID_FLAGS;
        if (!base) continue;
        const r = remaps.find((r) => base >= r.lo && base < r.hi);
        if (r) base += r.delta;
        data[i] = base | flags;
        usedGids.add(base);
      }
    }
  }

  // keep only tilesets that own at least one used gid
  const finalTilesets = [...keptByName.values()].filter((ts) =>
    [...usedGids].some((g) => g >= ts.firstgid && g < ts.firstgid + ts.tilecount)
  );

  fs.mkdirSync(`${OUT_DIR}/tiles`, { recursive: true });
  const embedded = finalTilesets.map((ts) => {
    fs.copyFileSync(ts.imagePath, `${OUT_DIR}/tiles/${ts.name}.png`);
    return {
      firstgid: ts.firstgid,
      name: ts.name,
      image: `tiles/${ts.name}.png`,
      imagewidth: ts.imageW,
      imageheight: ts.imageH,
      tilewidth: 16,
      tileheight: 16,
      tilecount: ts.tilecount,
      columns: ts.columns,
      margin: 0,
      spacing: 0,
    };
  });

  const out = {
    compressionlevel: -1,
    type: "map",
    version: "1.10",
    tiledversion: "1.11.0",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width: mapW,
    height: mapH,
    tilewidth: 16,
    tileheight: 16,
    nextlayerid: layerId,
    nextobjectid: 1000,
    tilesets: embedded,
    layers,
  };
  fs.mkdirSync(`${OUT_DIR}/maps-json`, { recursive: true });
  const json = JSON.stringify(out);
  fs.writeFileSync(`${OUT_DIR}/maps-json/${mapId}.json`, json);
  // legacy path: already-deployed clients fetch map.json directly
  if (mapId === "neighborhood") fs.writeFileSync(`${OUT_DIR}/map.json`, json);

  const mb = (f: string) => (fs.statSync(f).size / 1024 / 1024).toFixed(2);
  console.log(`${mapId}: ${mapW}x${mapH}, layers: ${layers.map((l) => l.name).join(", ")}`);
  for (const ts of embedded)
    console.log(`  tileset ${ts.name} firstgid=${ts.firstgid} → ${ts.image} (${mb(`${OUT_DIR}/${ts.image}`)} MB)`);
  const dropped = tilesets.filter((t) => !finalTilesets.includes(t)).map((t) => t.name);
  if (dropped.length) console.log(`  dropped (unused/dup, gids remapped): ${dropped.join(", ")}`);
}

for (const m of MAP_REGISTRY) exportMap(m.id, m.tmx);
