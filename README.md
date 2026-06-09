# UDM+

The friend-group home base. A private, invite-only PWA for the persistent
stuff Discord is bad at: **recipes, events, what everyone's watching,
shared files, wishlists, contact cards, and shared logins** — architected
so a Discord bot can plug in later without a rewrite.

Retro-brutalist on the outside (thick borders, hard shadows, loud flat
colors, a chunky pixel-cartridge logo), boring-in-a-good-way on the inside
(Next.js, Postgres, Prisma, REST).

## Stack

- **Next.js (App Router) + TypeScript** — one codebase for UI + API
- **PostgreSQL + Prisma**
- **Auth.js magic-link email auth** with a hard allowlist (no signups, ever)
- **S3-compatible object storage** (R2 / B2 / MinIO) via presigned URLs
- **Tailwind CSS** with the design tokens encoded as theme
- **Installable PWA** with an offline shell

## Architecture cheat sheet

- **Shell + modules.** Each feature (Cookbook, Events, Now Playing,
  Files, Wishlist, People, Vault) lives in `src/modules/<key>` with its
  API routes in `src/app/api/...`. New module = new folder + one entry
  in `src/modules/registry.ts`. Candidates for the next ones live in
  [`docs/IDEAS.md`](docs/IDEAS.md).
- **Vault security model.** Shared passwords are AES-256-GCM encrypted
  at rest with a key derived from `VAULT_KEY` (fallback: `AUTH_SECRET`).
  Listings never include secrets; decryption happens only in the
  per-entry reveal endpoint, and outbox payloads never carry them. This
  protects the database and backups — it is deliberately *not*
  end-to-end encryption, which would defeat "shared by the group".
- **Wishlist link previews** are scraped server-side (Open Graph tags,
  no external API) with an SSRF guard that refuses private addresses.
- **API-first.** Every capability is exposed under `/api` (session-cookie
  auth). The phase-2 Discord bot becomes a second client of the same API.
  Server-rendered pages read through the shared data layer the shell owns;
  all browser mutations go through `/api`.
- **Event outbox.** Every meaningful write also inserts an `OutboxEvent`
  row *in the same transaction* (`src/lib/outbox.ts`). Nothing consumes it
  yet; the future Discord worker drains `processedAt IS NULL`.
- **Authorization** is ownership-or-admin, enforced server-side on every
  mutating route (`assertCanModify` in `src/lib/session.ts`).

## Local development

```bash
cp .env.example .env          # fill in at least DATABASE_URL + AUTH_SECRET + SEED_ADMIN_EMAIL
npm install
npx prisma migrate dev        # creates the schema
npm run db:seed               # first admin + sample data
npm run dev
```

With no email provider configured, **magic links are printed to the server
console** in dev — paste them into the browser.

For file uploads locally, run MinIO (`docker compose up minio minio-init`)
or point the `S3_*` vars at a real bucket.

## Deploy (docker compose)

```bash
cp .env.example .env   # set AUTH_SECRET, AUTH_URL, email + S3 credentials
docker compose up -d --build
docker compose exec app ./node_modules/.bin/prisma db seed   # first run only
```

Migrations run automatically on container start. Works nicely behind
Coolify / Railway / Render — anything that can run a Dockerfile next to a
Postgres.

### Email

Set `RESEND_API_KEY` (preferred) or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
`SMTP_PASS`, plus `EMAIL_FROM`.

### Storage

Any S3-compatible store. For Cloudflare R2 / Backblaze B2 set
`S3_ENDPOINT`, `S3_BUCKET`, keys, and `S3_FORCE_PATH_STYLE=false`.
Files are private; access is via short-lived presigned URLs only.

## Membership

There is no signup. Admins add members (email + display name) on the
Admin page; only allowlisted emails can complete a magic-link sign-in —
unknown addresses get no account, no email, no error hint.

## The Discord seed (phase 2, not built)

- `User.discordUserId` is reserved as the join key.
- The `OutboxEvent` table already records `recipe.created`,
  `event.created`, `event.rsvp.changed`, `nowplaying.updated`,
  `file.uploaded`, etc.
- The bot: poll unprocessed rows → post to a channel → set `processedAt`.
  Slash commands call the same `/api` routes as the web client.

## Icons

`public/icons/*.png` are generated from `scripts/generate-icons.mjs`
(pure-Node PNG writer, no deps). Tweak the pixels, then:

```bash
node scripts/generate-icons.mjs
```
