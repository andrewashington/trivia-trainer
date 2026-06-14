# UDM+

The friend-group home base. A private, invite-only PWA for the stuff Discord
is bad at — and, increasingly, for fun. It started as **recipes, events, what
everyone's watching, shared files, wishlists, contact cards, and shared
logins**, and has grown into a **~34-module platform** with a full **Arcade**
(a tile-based "World," a group "Pet," friendly betting, and ~14 playable
games), an in-app **coin economy**, and group decision tools — all
architected so a Discord bot can plug in later without a rewrite.

Retro-brutalist on the outside (thick borders, hard shadows, loud flat
colors, a chunky pixel-cartridge logo), boring-in-a-good-way on the inside
(Next.js 14 App Router, Postgres, Prisma, REST).

> **New to the codebase?** Read this for the architecture, then
> [AGENTS.md](AGENTS.md) for how to work in the repo (test / deploy / parallel
> sessions) and [HANDOFF.md](HANDOFF.md) for the live deployment state +
> Railway runbook.

## Stack

- **Next.js 14 (App Router) + TypeScript** — one codebase for UI + API
- **PostgreSQL + Prisma** (~74 models)
- **Auth.js v5 magic-link email auth** with a hard allowlist (no signups, ever)
- **S3-compatible object storage** via presigned URLs — a **Railway Bucket**
  in prod, **MinIO** locally
- **Tailwind CSS** with the design tokens encoded as theme
- **Installable PWA** with an offline shell
- **Deploys only on Railway** (Dockerfile build, migrations on boot) — see
  [HANDOFF.md](HANDOFF.md)

## Architecture cheat sheet

- **Shell + modules, organized into five categories.** Each feature lives in
  `src/modules/<key>` with its API routes in `src/app/api/<key>/` and its page
  in `src/app/(app)/<key>/`. New module = new folder + one entry in
  `src/modules/registry.ts` (the **canonical, live list** — read it rather
  than trusting any hand-kept inventory). The ~34 modules sort into:
  - **Quests** — plans, places & people: Events, People, Map, Countdowns, Challenges
  - **Shelf** — shared things you consume: Cookbook, Now Playing, Files, Photobook
  - **Stash** — your stuff: Wishlist, Vault, Market
  - **Forum** — decide & opine together: Ideas, Polls, Reveal, Tiers, Smash-or-Pass
  - **Arcade** — fun & games: the **World**, the **Pet**, **Stakes** (predictions),
    and ~14 games (Snake, Blackjack, Poker, Slots, Mines, Crash, Limbo,
    Treasure, Tanks, Trivia, 20 Questions, How Gay?, Canvas…)
- **Coin economy + live "knobs."** Arcade games stake and pay out in-app
  **coins** (`src/lib/coins.ts`, `src/lib/coinRewards.ts`); odds, multipliers,
  payouts, and daily promos are tuned **at runtime** from the Admin console,
  stored in an `AppConfig` row and hot-cached (`src/lib/knobs.ts`,
  `src/lib/appConfig.ts`). Balancing a game is a setting change, **not** a
  code change — don't hard-code game odds, read the knobs.
- **The World.** A tile-based isometric world (Tiled-authored maps, avatars,
  walkable rooms, buy-and-place furniture, an item shop) — the most involved
  module by far. Deep-dives: [docs/world-design.md](docs/world-design.md) and
  [docs/tiled-walkthrough.md](docs/tiled-walkthrough.md). Source assets live in
  `assets-src/` and sync to S3 (`railway run … -s trivia-trainer`).
- **Vault security model.** Shared passwords are AES-256-GCM encrypted at rest
  with a key derived from `VAULT_KEY` (fallback: `AUTH_SECRET`),
  `src/lib/crypto.ts`. Listings never include secrets; decryption happens only
  in the per-entry reveal endpoint, and outbox payloads never carry them. This
  protects the database and backups — deliberately *not* end-to-end (which
  would defeat "shared by the group").
- **Wishlist link previews** are scraped server-side (Open Graph tags, no
  external API) with an SSRF guard that refuses private addresses.
- **The Map runs entirely on free services** — Leaflet + OpenStreetMap tiles +
  Nominatim geocoding (proxied server-side with the User-Agent their policy
  asks for). No API keys. Swap tiles via `NEXT_PUBLIC_MAP_TILE_URL` — no code
  change.
- **API-first.** Every capability is exposed under `/api` (session-cookie
  auth). Server-rendered pages read through the shared data layer the shell
  owns; all browser mutations go through `/api`. The phase-2 Discord bot
  becomes a second client of the same API.
- **Event outbox.** Every meaningful write also inserts an `OutboxEvent` row
  *in the same transaction* (`src/lib/outbox.ts`). It feeds the home activity
  feed and the Pet's derived state today; a future Discord worker drains
  `processedAt IS NULL`.
- **Authorization** is ownership-or-admin, enforced server-side on every
  mutating route (`src/lib/session.ts`).
- **Shared building blocks** (not registry modules): `src/modules/comments`
  (a reusable comment-thread + counts any feature can attach) and
  `src/modules/gamechat` (shared in-game chat). Reuse these rather than
  reimplementing.

## Local development

```bash
cp .env.example .env          # at least DATABASE_URL + AUTH_SECRET + SEED_ADMIN_EMAIL
npm install                   # use Node 22 (nvm use 22) to match Railway's lockfile
npx prisma migrate dev        # creates the schema
npm run db:seed               # first admin + minimal data
npm run dev                   # http://localhost:3000
```

With no email provider configured, **magic links are printed to the server
console** in dev — paste them into the browser. For file uploads locally, run
MinIO (`docker compose up minio minio-init`) or point the `S3_*` vars at a
real bucket. `npm run db:demo` loads richer demo content across every module.
Full local + Railway runbook: [HANDOFF.md](HANDOFF.md).

## Deploy

**Production is Railway, deploying the `main` branch on every push** (it builds
the Dockerfile; `docker-entrypoint.sh` runs `prisma migrate deploy` on boot).
Commit to `main` and push — that *is* the deploy. The live instance's state,
env vars, and CLI runbook are in [HANDOFF.md](HANDOFF.md); the from-scratch
"stand up a fresh instance" walkthrough is in [DEPLOY.md](DEPLOY.md).

## Membership

There is no signup. Admins add members (email + display name) on the Admin
page; only allowlisted emails can complete a magic-link sign-in — unknown
addresses get no account, no email, no error hint.

## The Discord seed (phase 2, not built)

- `User.discordUserId` is reserved as the join key.
- The `OutboxEvent` table already records `recipe.created`, `event.created`,
  `event.rsvp.changed`, `nowplaying.updated`, `arcade.highscore`, etc.
- The bot: poll unprocessed rows → post to a channel → set `processedAt`.
  Slash commands call the same `/api` routes as the web client. Scope notes:
  [docs/discord-integration-scope.md](docs/discord-integration-scope.md).

## Docs map

- [AGENTS.md](AGENTS.md) — working agreements (test, deploy, parallel
  sessions); imported by `CLAUDE.md` so every agent reads the same file.
- [HANDOFF.md](HANDOFF.md) — live deployment state, outstanding work, deploy
  gotchas already solved, and the Railway CLI runbook.
- [DEPLOY.md](DEPLOY.md) — from-scratch deploy walkthrough for a fresh instance.
- [docs/world-design.md](docs/world-design.md) /
  [docs/tiled-walkthrough.md](docs/tiled-walkthrough.md) — the World module.
- [docs/arcade-modules.md](docs/arcade-modules.md) — deep-dive notes on several
  Forum/Arcade modules (partial; `registry.ts` is the live category map).
- [docs/IDEAS.md](docs/IDEAS.md) — historical backlog (much of it shipped); the
  live backlog is the in-app **Ideas** module.

## Icons

`public/icons/*.png` are generated from `scripts/generate-icons.mjs` (pure-Node
PNG writer, no deps):

```bash
node scripts/generate-icons.mjs
```
