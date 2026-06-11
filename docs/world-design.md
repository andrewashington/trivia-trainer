# The World — design doc

A mini decorative game world inside UDM+. Walk around a tiny neighborhood
with your friends, own a house, buy furniture with coins, decorate it,
visit each other, flex. **Purely cosmetic — its job is to be charming and
to be a coin dump.** No combat, no progression mechanics, no stakes.

Status: **Phase 0 shipped and live; Phase 1 (catalog pipeline) in progress.**
This doc is the source of truth for the architecture AND the current-state
handoff — see "Status & handoff" at the bottom. Update it as work lands.

## Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Engine | **Phaser 3** + Tiled JSON maps | The browser 2D standard: tilemaps, sprite anim, arcade collision, camera built in. Mounts client-only in Next (`dynamic`, `ssr: false`). |
| Map authoring | **Tiled** (free desktop editor) | Andrew paints maps visually, exports JSON, Phaser loads it natively. No code per map. |
| World layout | **Outdoor neighborhood** | Streets + individual houses with interiors. Needs the Modern Exteriors pack (see Assets). |
| Presence | **Polling first, websockets later** | Client talks to a `PresenceTransport` interface. v1: REST heartbeat ~2s + client interpolation (matches existing in-memory-store/polling patterns, zero infra). v2: tiny sidecar `ws` service as a 2nd Railway service — Next app deployment untouched. Never hack a custom server into the standalone build. |
| Server authority | Coins, ownership, placements only | Movement/collision is client-side; it's decorative, there's nothing to cheat. Purchases use the canonical treasure-dig debit pattern. |
| Assets at runtime | Served from S3/R2, **never committed** | Repo is PUBLIC; LimeZu's license forbids redistributing raw assets. Local dev reads from an untracked `assets-src/` dir; build pushes packed atlases to object storage. |

## Asset packs (Andrew buys/downloads, keeps out of git)

- [Modern Interiors](https://limezu.itch.io/moderninteriors) — owned.
  Furniture, interior tilesets, character sprites w/ walk cycles.
- [Modern Exteriors](https://limezu.itch.io/modernexteriors) — **to buy**.
  Streets, grass, house facades, outdoor props. Same style/grid.
- Both land in `assets-src/` (gitignored). The ingestion tooling reads
  from there.

## Architecture

### Module wiring (standard UDM+ shape)
- `src/modules/world/` — Phaser scenes, transport, schema.ts (Zod)
- `src/app/(app)/world/page.tsx` — mounts the game client-only
- `src/app/api/world/...` — REST handlers via `apiHandler()` + `requireUser()`
- One entry in `src/modules/registry.ts` (category: arcade)

### Client (Phaser)
- `WorldScene` — outdoor neighborhood map, camera-follow, other players
  as interpolated ghosts, door tiles → interior scene transition
- `InteriorScene` — a house's interior; owner gets **decorate mode**
  (grid-snapped place/move/rotate of owned items)
- `ShopUI` / decorate UI — prefer DOM overlays (React) over in-canvas UI;
  plays nicer with the existing design system and mobile
- Mobile: tap-to-walk (simple A* on the walkability grid); PWA-friendly
- `PresenceTransport` interface: `{ join(mapId), move(x,y,facing), onPeers(cb), leave() }`
  with `PollingTransport` now, `SocketTransport` later

### Server
- Presence: in-memory `Map<mapId, Map<userId, {x,y,facing,at}>>` with TTL
  sweep (same pattern as `src/modules/trivia/store.ts`); heartbeat POST
  updates it, GET returns peers on the same map. Single Railway instance
  ⇒ in-memory is correct.
- Purchases: `db.$transaction` → check `coins` → negative `CoinTransaction`
  (`reason: "world.purchase"`) → `decrement` → create inventory row.
  Mirrors `api/treasure/route.ts:39-64`.
- Visiting/earning hooks later via `emitOutbox` + `COIN_RULES`
  (e.g. small daily award for visiting a friend's house).

### Data model (additive migration, hand-written SQL per repo convention)

```prisma
model WorldItem {        // catalog (admin-curated)
  id        String  @id @default(cuid())
  key       String  @unique   // e.g. "sofa-red-3x1"
  name      String
  category  String            // furniture | wall | floor | rug | outdoor | ...
  price     Int
  spriteKey String            // frame in the packed atlas
  tileW     Int     @default(1)
  tileH     Int     @default(1)
  surface   String  @default("floor")  // floor | wall
  published Boolean @default(false)
  ownedItems WorldOwnedItem[]
}

model WorldOwnedItem {   // inventory; placement lives on the row
  id        String   @id @default(cuid())
  userId    String
  itemId    String
  // null position = in storage, not placed
  x         Int?
  y         Int?
  rotation  Int      @default(0)
  createdAt DateTime @default(now())
  user User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  item WorldItem @relation(fields: [itemId], references: [id])
  @@index([userId])
}

model WorldHouse {       // one per user; tier = floorplan size (coin sink)
  id     String @id @default(cuid())
  userId String @unique
  tier   Int    @default(1)
  plotId String @unique   // which neighborhood plot/door is theirs
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

(Avatar look can ride the existing `User.avatarConfig` Json.)

## Content pipeline + admin tools (the "Andrew does this without code" layer)

The big content task is turning thousands of pack sprites into named,
priced items. Tooling makes it curation, not programming:

1. **Ingestion script** (`scripts/world-ingest.ts`) — walks `assets-src/`
   (LimeZu ships organized single-item PNGs), drafts `WorldItem` rows:
   name from filename, footprint from px dimensions, category from folder.
2. **Admin catalog page** (`/world/admin`, `requireAdmin()`) — browse
   drafts visually, set price/category, publish/hide. No code touched.
3. **Atlas build** (`scripts/world-pack.ts`) — packs *published* items
   into spritesheet atlases + uploads to S3/R2. Runs locally or on deploy.
4. **Maps**: Andrew authors the neighborhood + house-tier floorplans in
   Tiled → JSON dropped in S3 alongside the atlases.

## Phases

- **Phase 0 — Spike** *(1 session)*: Phaser in `(app)/world`, one Tiled
  map from pack tiles, walkable animated character, collision, camera.
  Proves the whole pipeline. **Andrew first**: buy Exteriors, drop both
  packs in `assets-src/`, install Tiled.
- **Phase 1 — Pipeline & admin**: ingestion, catalog admin page, atlas
  build, S3 serving. Exit: Andrew can publish a priced item end-to-end.
- **Phase 2 — Your house**: shop overlay, atomic purchase, decorate mode,
  persistence. Exit: buy a sofa, place it, reload, it's there.
- **Phase 3 — Social**: neighborhood map w/ per-user plots, visit friends'
  interiors, polled presence ghosts. Exit: two browsers see each other walk.
- **Phase 4 — Flex & juice**: house tiers (big coin sink), net-worth
  plaque/leaderboard, avatar cosmetics, emotes, doorbell → notification.
- **Phase 5 (optional) — Realtime**: `ws` sidecar service on Railway,
  cookie-validated against the `Session` table; swap `SocketTransport` in.

## Economy notes (tune in admin UI, not code)

Prices should sting: earn rates are ~10-100/event with 1000-coin jackpots,
and balances have accumulated. Rough anchors — small decor 50-200, real
furniture 300-1.5k, statement pieces 3-5k, house tiers 10k/25k/50k.
Status items with visibly absurd prices (golden toilet, 25k) are the point.

## Open questions

- Plot assignment: first-come pick vs admin-assigned?
- Should visiting/decorating *earn* trickle coins, or keep the world
  purely a sink? (Lean: tiny daily visit award to drive traffic.)
- Sell-back / refunds? (Lean: 50% buyback, keeps decisions low-stakes.)
- `vendor/pixelarticons-pro` is a paid pack already in the public repo —
  same license class as the LimeZu issue; worth a separate look.

---

# Status & handoff (updated 2026-06-11)

## Done — Phase 0 shipped (live, verified by Andrew)

- `/world` is live and walkable in prod (commit `20a2b0b`): Phaser 3 scene,
  Tiled-JSON map, 4-dir animated character, collision, camera follow,
  WASD/arrows + tap-to-move. **Deliberately NOT in `registry.ts`** — URL-only
  (`/world`) while WIP; register it when graduating.
- Asset route `/api/world/assets/[...path]`: dev streams from
  `assets-src/runtime/world/`, prod 302s to a presigned S3 URL. Auth-gated.
- `scripts/world-sync-assets.ts` uploads `assets-src/runtime/world/**` to
  s3 under `world/`. Spike assets (tileset.png, character.png, map.json)
  are already in the prod bucket.
- Deps added (intentional, Node 22 lockfile-clean): `phaser`, `sharp`.

### Spike asset facts (verified by measurement; needed for any sprite work)
- Tileset: `ME_Theme_Sorter_16x16/1_Terrains_and_Fences_16x16.png` —
  512×1184 px, 32 columns, 2368 tiles.
- Character: `0_Premade_Characters/16x16/Premade_Character_01.png` —
  896×656 px, 16×16 frame grid → 56 columns; index = row*56+col.
  Idle frames 0/1/2/3 = down/left/right/up. Walk cycles in row 1, 6 frames
  each: down 56–61, left 62–67, right 68–73, up 74–79. (Row order was
  inferred — if directions look swapped in game, remap in WorldScene.ts.)

### Known rough edges (fine for spike, fix during real content pass)
- map.json tile indices were guessed off the unlabeled sheet — terrain may
  look wrong. Replaced wholesale by Andrew's Tiled map.
- Idle is a single frame per direction.
- `props` layer renders above the player (depth 10 vs 5) — right for trees,
  revisit per-prop later (`props-overhead` is the long-term answer).

## In flight — Phase 1 (catalog pipeline). Schema is DONE, rest is NOT.

Prisma models `WorldItem` / `WorldOwnedItem` / `WorldHouse` + migration
`20260611133243_world_phase1` are committed. **Migration is NOT applied
anywhere yet** — Railway applies it on next deploy boot (additive, safe).
Local Postgres on the previous dev machine had a broken `udm` role; local
DB is optional, don't block on it.

### Locked contracts (build against these)
- `spriteKey = "<atlasKey>#<frameName>"`; atlases live at
  `world/atlas/<atlasKey>.png` + `.json` (Phaser JSON-hash format) in S3,
  written locally to `assets-src/runtime/world/atlas/` first, uploaded by
  the existing sync script. Same files serve the game AND the admin UI
  (admin renders frames via CSS background-position; no Phaser needed).
- **Everything is 16×16.** Always use the `_16x16` pack folders; footprint
  tileW/tileH = pxW/16, pxH/16. Apparent size = camera zoom (code knob).
- Item `key` slug: from pack path, e.g. `mi-bathroom-bathtub-1`
  (`mi`/`me` prefix = interiors/exteriors).

### Remaining Phase 1 work (was about to be delegated to parallel agents)
1. `scripts/world-ingest.ts` — walk curated singles folders (interiors
   `Theme_Sorter_Singles` 16x16 regular-shadow variant; exteriors Garden +
   a few fun theme folders; skip Shadowless/Black_Shadow dupes), measure
   each PNG with sharp, pack per-theme atlases (max 2048px pages),
   write atlas png+json, upsert draft `WorldItem` rows (idempotent by
   `key`; name/category parsed from filename, published=false, price=0).
   Run against prod DB via `railway run`.
2. Admin API `/api/world/admin/*` (requireAdmin): paginated item list with
   q/category/published filters; PATCH item (name/category/price/surface/
   published); bulk publish + bulk default-pricing (e.g. by footprint area).
3. Admin UI `/world/admin` (requireAdmin, hidden like /world): visual grid
   off the atlases, filters, inline edit, bulk actions.
4. Shop API (`/api/world/shop` list published, `/api/world/shop/buy`
   atomic debit mirroring `api/treasure/route.ts` with
   `reason: "world.purchase"`, `/api/world/inventory`). UI is Phase 2.

## Andrew's work list (Tiled, do whenever)

Step-by-step painting guide: `docs/tiled-walkthrough.md`. A generated
baseline layout is committed (see `scripts/world-generate-baseline.ts`;
re-running it overwrites hand edits). `scripts/world-crop-tiles.mjs`
renders gridded tileset crops for identifying tile coordinates.

Install Tiled (mapeditor.org). New Tileset → from
`assets-src/modern-exteriors/Modern_Exteriors_16x16/Modern_Exteriors_Complete_Tileset.png`
(or Theme_Sorter sheets if too big), tile size 16×16, **Embed in map** ✅.
New Map: orthogonal, 16×16, ~60×40. Export as **JSON .tmj** into
`assets-src/runtime/world/maps/`.

Layer contract v3 (names exact, bottom→top). Three tile layers map 1:1
to the engine's three depths — solidity comes from the `collision`
object layer, not from which tile layer something is on:
| layer | type | contents |
|---|---|---|
| `ground` | tiles | terrain, roads, paths, walkable decoration — no holes |
| `props` | tiles | buildings, trees, fences, benches — anything standing on the ground |
| `overhead` | tiles | draws above players: treetops, awnings, roof peaks |
| `collision` | objects | rectangles over solids + map border |
| `spawns` | objects | points: `spawn`, `plot-1-door`…`plot-8-door` |

Author from the **`0_Working` tileset** — a small curated sheet (fills,
transition kits, road markings, decor, trees, house kits) built by
`scripts/world-build-working-tileset.ts` from the category composites;
see `assets-src/runtime/world/tilesets/working-manifest.json` for what's
where. It carries Tiled **Terrain Sets** (grass/dirt, grass/water) so
the Terrain Brush auto-picks transition tiles. The 6 category mega-sheets
stay loaded for hunting anything not in the working set.
Map is 120×80 @ 16px. Animated water painted from first-frame tiles;
animation wired Phaser-side later.

Design: small road loop, ~8 house facades, park/plaza in the middle.
Hand back: filename + tilesets used + plot count.

## New-machine setup runbook

1. Clone repo; `brew install node@22 railway` (node@22 is keg-only — use
   `PATH=/opt/homebrew/opt/node@22/bin:$PATH` for ALL npm/npx, lockfile trap).
2. `npm ci` (under Node 22).
3. `railway login` then
   `railway link --project strong-energy --service trivia-trainer`.
4. **Asset packs are gitignored and must be re-downloaded** from itch.io
   (Modern Interiors + Modern Exteriors, owned on Andrew's account) and
   unzipped to `assets-src/modern-interiors/` + `assets-src/modern-exteriors/`
   (win zips; same layout as before). Spike runtime files can be pulled
   back from S3 `world/` or re-copied from the packs per the paths above.
   Then `npx tsx scripts/world-build-tilesets.ts` regenerates the composite
   tileset PNGs (gitignored art) that the committed Tiled project
   (`assets-src/world.tiled-project`) and .tsx files reference, and
   `npx tsx scripts/world-build-working-tileset.ts` regenerates the
   curated 0_Working sheet from those composites.
5. Sync assets to prod bucket after changes:
   `PATH=/opt/homebrew/opt/node@22/bin:$PATH railway run npx tsx scripts/world-sync-assets.ts`
6. Live spike: https://udm-plus.up.railway.app/world
