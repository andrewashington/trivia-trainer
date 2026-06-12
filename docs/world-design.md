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

# Status & handoff (updated 2026-06-11, end of "playable demo" phase)

## Done — live in prod, verified by Andrew

- `/world` plays like Pokémon: Andrew's hand-painted island map
  (`neighborhood.tmx`, 50×50), strict 4-direction movement (hold-priority
  keyboard; axis-aligned L-shaped tap-to-walk), loading screen w/
  two-stage progress bar + camera fade-in, feet-only collision body,
  6-frame idle + walk animations. **Still NOT in `registry.ts`** —
  URL-only while WIP; register it when graduating.
- **Character creator + onboarding** at `/world/create` (full UDM+ design
  system, DOM-only preview off the real sheets): skin(9)/eyes(7)/
  hair(29+bald, ~7 colors)/outfit(5 starter styles, variants). First
  `/world` visit without an avatar redirects there; "restyle" chip to
  return. Save = zod-validate vs manifest → sharp-composite
  body<eyes<outfit<hair → `world/avatars/<userId>.png` in S3 (local
  runtime dir in dev) → `WorldAvatar` row (own table; `User.avatarConfig`
  belongs to the SITE avatar builder — don't touch it). Cache-busted via
  `?v=<updatedAt>`.
- Map pipeline (repeatable, no code per iteration):
  edit `neighborhood.tmx` in Tiled → `npx tsx scripts/world-export-map.ts`
  (tmx → engine map.json + only-used tileset images; dedups + gid-remaps
  doubly-referenced tilesets; verifies zero orphan gids) →
  `railway run npx tsx scripts/world-sync-assets.ts`. Prod picks it up on
  next page load — no deploy needed.
- Tiled authoring setup (committed, art rebuilt per machine):
  `assets-src/world.tiled-project`, 6 composite category tilesets +
  curated `0_Working` (built by `world-build-tilesets.ts` +
  `world-build-working-tileset.ts`), terrain sets (Wang) on BOTH
  0_Working and the 1_Terrain_and_Water mega-sheet.
- **Interior authoring setup** (same pattern, from the Modern Interiors
  pack): 6 `I*`-prefixed composite tilesets (`I1_Room_Builder` =
  structural floors/walls/entryways + floor shadows; `I2`–`I6` = themed
  furniture/decor) built by `world-build-interior-tilesets.ts`, manifest
  at `tilesets/composites/interiors-manifest.json`. Start a new interior
  by **copying `maps/interior-template.tmx`** — it pre-loads all 6
  interior tilesets and carries the layer contract (ground/props/overhead
  tile layers + `collision` object layer).
- Deps added (intentional, Node 22 lockfile-clean): `phaser`, `sharp`.
- **Multiplayer presence v1 (polling)** — shipped 2026-06-11, pending
  Andrew's in-browser verify. `PresenceTransport` interface +
  `PollingTransport` (`src/modules/world/transport.ts`, 2s heartbeat,
  skip-don't-queue on slow responses, `sendBeacon` leave on pagehide);
  in-memory server store w/ 10s TTL sweep
  (`src/modules/world/presenceStore.ts`, trivia-store pattern);
  `POST /api/world/presence` does heartbeat+peers in one round-trip and
  resolves each peer's composited avatar sheet path once per join
  (cached in module memory). Scene renders peers as non-colliding ghost
  sprites with their own avatar sheets, per-texture-key anims
  (`createCharacterAnims`), eased interpolation (1.25× walk speed,
  snap-teleport beyond 160px), and name labels. mapId is the constant
  `"neighborhood"` for now — becomes meaningful when interiors land.
- **Multiplayer presence v2 (websocket sidecar)** — shipped 2026-06-11,
  pending Andrew's in-browser verify. `services/world-ws/` is a
  dependency-light Node `ws` room server (own package.json + npm-10
  lockfile, ~200 lines, no DB, no shared code) deployed as the
  **`world-ws` Railway service** in the same project
  (`wss://world-ws-production.up.railway.app`). It is NOT on the
  repo-autodeploy hook — redeploy manually after editing it, and note
  the CLI gotcha: `railway up` uploads the **linked repo root** (which
  built the Next Dockerfile by mistake), so deploy by copying the three
  files to a temp dir, `railway link -p <projectId> -e production -s
  world-ws`, then `railway up --service world-ws --detach` from there.
  Auth:
  `GET /api/world/ws-token` mints a 60s HMAC token (payload carries
  userId/name/sheetPath) signed with `WORLD_WS_SECRET`, set on BOTH
  services; the app also has `WORLD_WS_URL`. Client `SocketTransport`
  samples player state at 10Hz, sends only on change, reconnects with
  backoff (3 strikes), and degrades to `PollingTransport` on its own
  when the sidecar is unconfigured or unreachable — the scene just
  constructs `SocketTransport`. Protocol doc lives at the top of
  `services/world-ws/server.js`; keep it in sync with `transport.ts`
  and the token shape in `ws-token/route.ts`.

### Asset facts (verified by labeled-crop measurement — never guess grids)
- Character generator sheets (`2_Characters/Character_Generator/*/16x16`):
  **16×32 frames** (two tiles tall), 56 cols, 896×656 canvas. Row 0 =
  4 idle stills; **row 1 = 6-frame idle anim; row 2 = 6-frame walk**;
  direction order **right, up, left, down**. All part layers (Bodies/
  Eyes/Hairstyles/Outfits) share this grid exactly… except **Bodies ship
  927px wide** (palette strip) — `world-character-parts.ts` normalizes
  every sheet to 896×656 at staging; keep that invariant.
- `scripts/world-crop-tiles.mjs` renders gridded labeled crops — the tool
  for verifying any sheet layout by eye. Cheap and definitive.

### Gotchas learned this phase (each cost a real debugging loop)
- **sharp on Railway/alpine**: Next standalone tracing copies sharp's JS
  but NOT the `@img/*` native libvips packages → runtime 500s only in
  prod. Dockerfile explicitly COPYs `node_modules/@img` (same class of
  fix as the .prisma engine copy next to it).
- **Tiled can silently embed a duplicate of an external tileset** into a
  .tmx (paste/embed click). Legal map, but naive dedup orphans gids →
  Phaser crashes (`t.tiles[i.index]`). world-export-map.ts remaps gids
  from dropped duplicates onto the kept copy; keep that logic.
- **Phaser scenes with async create()**: `update()` runs before the world
  exists — guard on `this.player`. (Black canvas + `this.player.body`
  TypeError = this.)
- **Terrain (Wang) sets must include every "plain" variant tile** the map
  uses as base fill, or the Terrain Brush shows red "missing transition"
  next to it. The map's grass-looking base fill was actually a water
  shimmer decor tile. Variant solids are registered in
  `world-build-tilesets.ts` (GRASS_SOLIDS / WATER_SOLIDS / DIRT_*).
- **Tiled tileset files use the `.tsx` extension** — TypeScript tries to
  compile them; `assets-src` is excluded in tsconfig. Don't un-exclude.
- The `1_Terrain_and_Water` mega-sheet `.tsx` (incl. wang sets) is
  GENERATED by `world-build-tilesets.ts`; `0_Working.tsx` by
  `world-build-working-tileset.ts`. Hand-edits to either get overwritten
  on rebuild — fold changes into the scripts.

### Known rough edges (acceptable, revisit later)
- Animated water tiles render static (first frame); wire Phaser-side
  tile animation during a polish pass.
- Outfit catalog: creator exposes 5 starter styles; all 33 are staged in
  S3 as future store inventory (`BASE_OUTFITS` in
  `world-character-parts.ts`). Accessories/Books/Smartphones categories
  not staged at all yet — store flow will need both.
- `neighborhood.tmx` has stray siblings (`untitled.tmx`, `5.tsx`) in the
  maps dir — junk from Tiled experiments, safe to delete.
- Plot doors (`plot-1-door`…) not placed yet — needed for Phase 2/3
  houses, not for walking around.

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

Setup is pre-built — open `assets-src/world.tiled-project` in Tiled
(mapeditor.org) and edit `maps/neighborhood.tmx`; rebuild the gitignored
art first per the runbook below. The instructions that follow predate
the committed project; kept for context only.

Layer contract v3 (superseded by v4 — see "Adding a new map" runbook
below, which adds `portals` + `npcs` layers and generic tile-layer
ordering). Three tile layers map 1:1
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

## Interactive elements (runbook — the shop is the reference implementation)

First shipped 2026-06-12: the market shopkeep sells outfit cosmetics for
coins. The architecture is the template for every future interactive
element (vendors, minigames, mailboxes, house decoration):

- **Phaser owns the world, React owns the UI.** Anything with forms,
  money, or persistence is a React modal over the canvas + API routes —
  never built in Phaser.
- **`src/modules/world/bridge.ts`** is the typed event bus between them.
  Scene emits `open-panel` (player input freezes via `uiOpen`); React
  modal renders in `WorldClient`; closing emits `panel-closed`;
  `avatar-updated` hot-swaps the player sheet in-scene (versioned
  texture key — `playerKey` survives map transitions).
- **NPC → panel wiring** is the `NPC_PANELS` table in `WorldScene.ts`
  (npc object name → panel id). Non-listed NPCs cycle `NPC_LINES`.
- **Cosmetics specifically:** catalog (names/prices/colors) is code, in
  `src/modules/world/cosmetics.ts`; ownership is the
  `WorldOwnedCosmetic` table (userId, kind, itemKey — kinds beyond
  "outfit" reuse it). All 33 outfit styles are staged on S3; the
  creator manifest carries only the 5 starters, and purchased styles
  are merged in at /world/create (server passes `ownedOutfits`) and
  validated server-side in the avatar/equip routes (`wearableOutfits`).
- **Money:** spends follow the pet-rename pattern — balance check +
  `coinTransaction.create` (negative amount) + `user.coins decrement` +
  ownership row, all in one `withOutbox` transaction
  (`world.cosmetic.purchased`).
- **Endpoints:** `GET /api/world/shop` (catalog+coins+config),
  `POST /api/world/shop/purchase`, `POST /api/world/shop/equip`.

To add a new interactive element: add the bridge event/panel id, an
entry in `NPC_PANELS` (and an `npcs` point on the map), a modal in
`src/modules/world/`, rendered from `WorldClient`, and API routes under
`/api/world/<thing>/`. Server-side validation always; the client is a
rumor.

**Game-data layer + admin console (added 2026-06-12):** `/world/admin`
(admin-gated, linked from /world's header) manages the game: shop
pricing, NPC dialogue, the map registry, and Andrew's process runbooks
(`src/modules/world/admin/runbooks.ts`). Defaults live in code;
overrides live in the `WorldConfig` table (key → JSON document) and are
merged by `src/modules/world/content.ts` — game/shop code must read
through `getEffectiveCatalog()`/`getDialog()`, never the raw defaults,
so admin edits apply without a deploy. NPC dialog reaches the scene via
`GET /api/world/content` (loaded in preload); shop copy rides the shop
payload. New tunables = a new WorldConfig key + a tab/field in the
console, not a new table.

## Adding a new map (runbook — follow this every time)

Andrew-facing tooling: **World Studio** (`npm run world:studio`, or the
"World Studio.command" launcher on his Desktop) — a local-only control
panel (scripts/world-studio.ts, 127.0.0.1:4499) with buttons for
new-map scaffolding, open-in-Tiled, validate, and a full "Ship maps"
chain (validate → commit map files → rebase → typecheck → push both
branches → S3 sync). The steps below are what those buttons run.

The engine is multi-map (since 2026-06-12): each map is its own presence
room, portals teleport between maps, and NPCs are placed per-map. The
contract below is what the engine actually reads — anything else in the
.tmx is ignored.

**Layer contract v4** (names exact; tile layers render in authoring
order below the player, except `overhead`):

| layer | type | contents |
|---|---|---|
| any tile layers, e.g. `ground`+`props` (exterior) or `subfloor`+`floor`+`props` (interior) | tiles | drawn bottom→top in authoring order, under the player |
| `overhead` | tiles | draws above players: treetops, awnings, tall furniture tops |
| `collision` | objects | rectangles over solids + map border |
| `spawns` | objects | named points: `spawn` (default arrival) + one named point per door you can arrive FROM (e.g. `market-exit` just outside the shop door) |
| `portals` | objects | rectangles; **name = target map id**, **Class/type = spawn-point name to arrive at** (defaults to `spawn`). Player's feet touching the rect triggers the transition. Portals are disarmed until you step off them once, so an arrival spawn overlapping the return portal is fine. |
| `npcs` | objects | named points; **name = dialog key** (see `NPC_LINES` in `WorldScene.ts`), **Class/type = display name**. NPC renders from the premade `character.png` sheet, is solid, and talks when clicked or via `E` in range. |

**Steps:**

1. Scaffold it: `npm run world:new-map -- <id> --kind interior|exterior
   [--size WxH] [--label "Name"]`. This writes a contract-correct .tmx
   (layers pre-named, tilesets loaded, collision border, `spawn` point,
   empty `npcs`/`portals` layers) AND registers it in MAP_REGISTRY.
   (The old copy-the-template flow is retired; interior-template.tmx
   was deleted in favor of the generator.)
2. Paint tile layers; add `collision` rects; add a `spawns` point named
   `spawn`; add a `portals` rect back to where you came from (name =
   source map id, Class = the named spawn point you added on the source
   map just outside this building's door).
3. On the source map (e.g. `neighborhood.tmx`): add a `portals` rect over
   the doorway (name = new map id, Class = `spawn`), and a `spawns`
   point just below/outside the door for re-emerging.
4. (Registration already happened in step 1 — `MAP_REGISTRY` in
   `src/modules/world/maps.ts` feeds the exporter and /world/admin.)
5. (If the map has NPCs) add their dialog lines under the same key in
   `NPC_LINES` in `src/modules/world/WorldScene.ts`.
6. Export + verify: `npm run world:export` — this also VALIDATES the
   map contract (required layers, spawn points, portal targets/arrival
   spawns, stuck-map detection) and exits nonzero with fix-its. Then
   `npm run typecheck`.
7. Ship: commit, push, and
   `railway run --service trivia-trainer npx tsx scripts/world-sync-assets.ts`
   (the repo may be railway-linked to world-ws, which has no S3 vars — the
   `--service` flag is required). Assets go to S3 independently of the
   code deploy; you need BOTH if you touched code.

Hand back to Claude: just say which .tmx you saved, what the map id
should be, and where the doors are — steps 3–7 are Claude's job.

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
   curated 0_Working sheet from those composites, and
   `npx tsx scripts/world-build-interior-tilesets.ts` regenerates the
   interior (I1–I6) composite sheets from the Modern Interiors pack, and
   `npx tsx scripts/world-character-parts.ts` re-stages the character
   generator part sheets (normalized to the 896×656 grid) + manifest.
5. Sync assets to prod bucket after changes:
   `PATH=/opt/homebrew/opt/node@22/bin:$PATH railway run npx tsx scripts/world-sync-assets.ts`
6. Live spike: https://udm-plus.up.railway.app/world
