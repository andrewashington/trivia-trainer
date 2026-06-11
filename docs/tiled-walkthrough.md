# Tiled walkthrough — refining the neighborhood map

Beginner-oriented guide for working on
`assets-src/runtime/world/maps/neighborhood.tmj` (120×80 @ 16px).
Companion to the layer contract (v3) in `docs/world-design.md`.

> **A baseline already exists.** `scripts/world-generate-baseline.ts`
> generated the crude layout (grass+pond, ring road+sidewalks+plaza,
> 8 villas, trees, collision, spawns). Your job is refinement, not
> starting from blank. Don't re-run the generator after hand-editing:
> it rewrites the layers from scratch.

## Setup (2 min)

1. Build the art if needed (PNGs are gitignored):
   `npx tsx scripts/world-build-tilesets.ts` then
   `npx tsx scripts/world-build-working-tileset.ts`.
2. Open `assets-src/world.tiled-project` in Tiled.
3. Turn on **View → Highlight Current Layer** and zoom to ~200–400%.

## The three layers (that's all)

| layer | what goes on it |
|---|---|
| `ground` | terrain, roads, paths, flowers, cracks — the floor |
| `props` | houses, trees, fences, benches — things standing on the floor |
| `overhead` | anything that should draw *above* the player (treetops, awnings) |

If it's floor → `ground`. If it's a thing → `props`. If the player
should walk *behind* it → `overhead`. Solidity is **not** decided here —
that's the `collision` object layer.

## Author from 0_Working — ignore the mega-sheets

The **0_Working** tileset (first in the Tilesets panel) has everything
the neighborhood needs, one screen tall, organized top to bottom:

- **Row 1** — plain fills: grass, dirt, water, sidewalk, asphalt,
  cobblestone, brick, paving
- **Rows 3–5** — terrain transition kits + the 3×3 pond
- **Rows 7–10** — road markings (crosswalks, lane dashes) + water decor
  (shimmer, lily pads)
- **Rows 12–14** — grass decals, dirt patches, flower beds, fences
- **Rows 16–20** — tree
- **Rows 22+** — the three villa kits (drag a rectangle over a whole
  villa to stamp it)

The six category mega-sheets stay loaded below it for the occasional
treasure hunt; `composites/manifest.json` says what's in each. If you
find a tile you'll reuse, add it to `scripts/world-build-working-tileset.ts`
and rebuild instead of scrolling for it twice.

## Terrain Brush = tiles that join themselves

This is the feature you expected tilemaps to have. For dirt patches,
paths-worn-in-grass, and pond/lake edges, do NOT hand-pick edge pieces:

1. Select the **Terrain Brush** (shortcut `T`), with `ground` active.
2. In the Terrain Sets panel pick **Grass / Dirt** (or **Grass / Water**)
   and click the *dirt* (or *water*) color.
3. Drag on the map. Tiled places fills, edges, and corners for you.
   Paint the other color to erase back.

Roads don't need this — in this art style a road IS plain asphalt fill
butted against sidewalk fill (that's how LimeZu draws cities). Drag
rectangles (`R`) of asphalt/sidewalk, then sprinkle crosswalk and lane
decals from the road-markings block on top.

## Refinement checklist (in order of payoff)

1. **Reshape the layout if you want** — move/resize plaza, roads, pond
   (terrain brush for the pond edge), reposition villas (grab a whole
   villa from 0_Working and stamp; erase the old one with a rectangle
   selection on `props`).
2. **Soften the terrain** — terrain-brush some dirt patches and a worn
   path or two; scatter grass decals and flower beds (`ground`).
3. **Furnish** (`props`) — fences along yards, benches/lamps from the
   mega-sheets, more trees. Cluster, don't space evenly.
4. **Overhead pass** — move tree canopy rows (top ~3 rows of each tree)
   from `props` to `overhead` so players walk behind foliage: rectangle-
   select, cut, switch layer, paste in place.
5. **Collision + spawns** — the generator made rects for everything it
   placed (full house footprints, tree trunks, pond, border). If you move
   or add solids, move/draw their rectangles (`R` on `collision`).
   Keep the 9 named points on `spawns` (`spawn`, `plot-1-door`…`plot-8-door`)
   in front of the right doors — exact names, the engine looks them up.

## Done — hand-back

Save (plain Ctrl/Cmd+S, it's already `.tmj`). Hand back per
`world-design.md`: filename, tilesets used, plot count (8).

## If you get stuck

- **Painted on the wrong layer** → eraser only affects the active layer.
- **Terrain brush makes a mess** → it only knows tiles in its terrain
  set; if you hand-placed other tiles in the area it may clash. Undo is
  unlimited and crosses layers.
- **Tile looks misaligned** → you grabbed a partial multi-tile object;
  re-select the full rectangle in the tileset.
- **Can't find a tile** → check the 0_Working sections above first, then
  `composites/manifest.json` for the mega-sheets.
