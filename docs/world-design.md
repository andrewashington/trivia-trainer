# The World — design doc

A mini decorative game world inside UDM+. Walk around a tiny neighborhood
with your friends, own a house, buy furniture with coins, decorate it,
visit each other, flex. **Purely cosmetic — its job is to be charming and
to be a coin dump.** No combat, no progression mechanics, no stakes.

Status: **approved direction, pre-build.** This doc is the source of truth
for the architecture; update it as decisions change.

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
