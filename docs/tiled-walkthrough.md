# Tiled walkthrough — painting the neighborhood map

Beginner-oriented, step-by-step guide for filling out
`assets-src/runtime/world/maps/neighborhood.tmj` (120×80 @ 16px).
Companion to the layer contract in `docs/world-design.md`.

## Setup (2 min)

1. Open `assets-src/world.tiled-project` in Tiled (File → Open File or
   Project). The map and all 6 tilesets load automatically.
   (If tilesets show as missing art, run
   `npx tsx scripts/world-build-tilesets.ts` first — the PNGs are
   gitignored.)
2. Turn on **View → Highlight Current Layer**. With 7 tile layers it's the
   only way to stay sane — everything not on the active layer dims.
3. Zoom to ~200–400% (Ctrl/Cmd + wheel). 16px tiles are tiny at 100%.

## The golden rule: passes, not regions

Don't try to finish one corner of the map. Work the whole map in passes,
bottom layer to top, crude to fine. The first passes are ugly — that's
correct. Layout decisions (where roads and houses go) are cheap to change
when the map is crude and expensive once it's detailed.

## Tools you need (only these)

| key | tool | use |
|---|---|---|
| `B` | Stamp brush | paint the selected tile(s) |
| `F` | Bucket fill | flood-fill an area |
| `E` | Eraser | remove tiles (only from the active layer) |
| `R` | Rectangle (shape fill) | drag out filled rectangles of a tile |
| right-click-drag **on the map** | eyedropper/capture | copies tiles already placed — fastest way to repeat a pattern |
| `X` / `Y` | flip horizontal / vertical | vary trees, cars |

**Multi-tile objects are the key trick:** houses, big trees, and vehicles
span many tiles. In the Tilesets panel, click-drag a rectangle over the
whole object (entire house facade, whole tree) — the stamp brush then
places it as one unit. Never place a house tile-by-tile.

## Where things are in the tilesets

Each composite tileset is the LimeZu theme sheets stacked vertically, in
this order (top → bottom; see `composites/manifest.json` for exact rows):

- **1_Terrain_and_Water** — terrains & fences, beach, then water/sea
  first-frame tiles at the very bottom (use these for ponds; animation is
  wired in Phaser later).
- **2_Nature_and_Outdoors** — garden (trees, bushes, flowers), camping,
  graveyard.
- **3_City_and_Streets** — city terrains (roads, sidewalks) at top, city
  props (lamps, benches, hydrants), vehicles, worksite.
- **4_Houses** — house facades. Huge sheet; scroll until you find ~8
  styles you like.
- **5_Civic_and_Shops** — shops, civic buildings (use for the plaza
  edge if you want a storefront or two).
- **6_Misc_and_Fun** — flavor props.

## The passes

### Pass 1 — `terrain-base`: fill the world (~5 min)
Select the plain grass tile (1_Terrain_and_Water, near top), bucket-fill
the entire map. Then carve one pond: rectangle of water first-frame tiles
somewhere off the road (a corner of the park works). No holes allowed on
this layer — every cell must have a tile.

### Pass 2 — `terrain-roads-paths`: the skeleton (~15 min)
This pass IS the level design — everything else hangs off it. Using plain
road tiles from 3_City_and_Streets and the `R` rectangle tool:

- One road **loop** — e.g. a ring roughly from (20,14) to (100,62),
  3–4 tiles wide. Leave a 12–14 tile margin outside the loop.
- **Sidewalk** tiles along both edges of the road.
- A **plaza/park** floor in the middle of the loop (paths, maybe a paved
  plaza area).

Use plain/straight tiles only; skip corner and edge transition tiles for
now. Walk it mentally: spawn → road → any house in under ~15 seconds.

### Pass 3 — `buildings`: 8 house facades (~20 min)
From 4_Houses, rectangle-select an entire facade in the tileset panel and
stamp it. Place ~8 around the outside of the loop, doors facing the road,
with a few tiles of yard between road and door. Vary the styles. Roughly
2–3 per long side, 1–2 per short side. Optionally one shop from
5_Civic_and_Shops facing the plaza.

**Stop and review here.** Zoom out to 100%. Does the layout read as a
neighborhood? Move things now — this is the last cheap moment.

### Pass 4 — `props-solid`: furnish (~20 min)
Trees and bushes (2_Nature) in yards and around the park; benches, lamps,
hydrants, a parked car or two (3_City) along the road; a fence segment or
two (1_Terrain). Cluster props — three trees together beat three trees
evenly spaced. Leave walking room: every door must be reachable, paths
≥2 tiles wide.

### Pass 5 — fine detail (~15 min, easy to overdo)
- `terrain-detail`: scattered flowers, grass tufts, road cracks, leaves.
  Sparse — maybe 1 in every 30 tiles.
- `props-walkover`: doormats at each of the 8 doors, a manhole or two on
  the road.
- `overhead`: tree canopy tops and any awning/roof tiles that should draw
  **above** the player. For big LimeZu trees: trunk rows on `props-solid`,
  canopy rows on `overhead`, so players walk behind the foliage.
- Now also fix the worst terrain seams with transition/corner tiles
  (grass→road edges). Don't chase perfection; LimeZu plain tiles already
  read fine.

### Pass 6 — `collision` (object layer)
Select the `collision` layer, press `R` (Insert Rectangle), and drag
rectangles over everything solid: building footprints (the part the
player shouldn't walk through — usually all but the door tile), trees
(trunk only, not canopy), fences, benches, vehicles, the pond. Then four
long rectangles framing the map border. Rectangles can be sloppy/
overlapping; nobody sees them.

### Pass 7 — `spawns` (object layer)
Insert Point tool (`I`). Place **9 points**:
- one named `spawn` — on the road or plaza, central.
- one in front of each house door, named `plot-1-door` … `plot-8-door`.

Set each point's **Name** field in the Properties panel (exact names —
the engine looks them up by name).

## Done — hand-back

Save (it's already `.tmj` JSON — plain Ctrl/Cmd+S). Hand back per
`world-design.md`: filename, tilesets used, plot count (8).

## If you get stuck

- **Painted on the wrong layer** → select that layer, eraser only affects
  the active layer.
- **Tile looks misaligned** → you likely grabbed a partial multi-tile
  object from the tileset; re-select the full rectangle.
- **Can't find a tile** → check the manifest section order above; the big
  sheets are grouped by theme vertically.
- **Undo** is unlimited (Ctrl/Cmd+Z) and crosses layers.
