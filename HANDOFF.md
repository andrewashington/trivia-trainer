# UDM+ — Agent Handoff

Read this first if you're an agent (or human) picking this project up.
For the product/architecture overview see [README.md](README.md); for the
full deploy walkthrough see [DEPLOY.md](DEPLOY.md); for working agreements
see [CLAUDE.md](CLAUDE.md). This file is the **current state + runbook**.

_Last updated: 2026-06-10._

---

## TL;DR

UDM+ is a private, invite-only PWA for a friend group (recipes, events,
polls, a shared vault, a group "pet", etc.). It is **deployed and live**.

- **Live URL:** https://trivia-trainer-production.up.railway.app
- **Repo:** https://github.com/andrewashington/trivia-trainer
  *(repo is named `trivia-trainer` for historical reasons; the app is UDM+)*
- **Host:** Railway — project **strong-energy** (`7e177349-d4d8-43dd-a2bb-f758d9d0df2f`),
  environment **production**, service **trivia-trainer** (`58f13bba-1f25-4477-9c88-9ef45a59d142`),
  plus a **Postgres** service.
- **Admin user:** `andre.d.washington@gmail.com` (created automatically on boot).
- **Email:** Resend, sending from `login@deliciouscommunications.com` (domain verified).

### Branches — important
Railway deploys the **`claude/serene-feynman-e4tdza`** branch (it's the
repo's default branch on GitHub). Throughout the build we kept **`main`**
and `claude/serene-feynman-e4tdza` pointing at the **same commit** after
every change. **When you push, push to both** (or switch Railway's deploy
branch to `main` in service → Settings → Source, then just use `main`).
Current HEAD both branches: see `git log --oneline -1`.

---

## Status checklist

- [x] App builds, deploys, and boots cleanly on Railway
- [x] Postgres provisioned; all migrations applied on boot
- [x] Admin account auto-created from `SEED_ADMIN_EMAIL`
- [x] Resend email configured (magic-link sign-in)
- [x] `/api/health` returns `{"status":"ok","db":"up"}`
- [ ] **Owner has completed first sign-in** (magic link → onboarding) — verify
- [ ] Friends added (Admin page, allowlist-only)
- [x] File/photo uploads — wired to a **Railway Bucket** (`reserved-envelope`), CORS set
- [ ] Railway billing/payment method added (was on trial credit)

---

## Feedback triage → agent-ready cards
The in-app **Feedback** button captures kind (bug/idea/praise), bug
**severity**, the message, the page path, user agent, and a client
**context** snapshot (viewport, locale, timezone). Admins triage on the
**Admin → Feedback** page (per-item *Copy as prompt* button hands an
agent-ready brief straight to the clipboard). To materialize open items as
Markdown cards for a coding agent to work through:

```bash
railway run npm run triage:export   # pulls the PROD database
# or: npm run triage:export         # local .env DATABASE_URL
```

Cards land in `docs/triage/` (one per open bug/idea + a README index). The
script is read-only on the DB and regenerates the whole open set each run —
resolve an item in the Admin page and re-run to clear its card.

## Outstanding work (in rough priority order)

1. ~~**File & photo uploads are disabled.**~~ **DONE (2026-06-10).** Now
   backed by a **Railway Bucket** named `reserved-envelope` (S3-compatible,
   no third-party signup). The `S3_*` vars on `trivia-trainer` point at it:
   `S3_ENDPOINT=https://t3.storageapi.dev`, `S3_BUCKET=reserved-envelope-mlptabt`,
   `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=false`, plus the bucket's
   access key / secret. **Bucket CORS is required** for the browser's
   direct presigned PUT — a policy allowing `PUT/GET/HEAD` from the live
   origin(s). **If uploads start failing with a CORS/preflight error after
   the app URL/domain changes, re-apply CORS:** edit the origins in
   `scripts/set-bucket-cors.ts` and run `railway run npx tsx
   scripts/set-bucket-cors.ts` (uses the prod S3_* creds). Currently
   allows `https://udm-plus.up.railway.app` + the
   `deliciouscommunications.com` apex/www. Credentials come from the
   Railway API (`bucketS3Credentials` query) or the bucket's Connect tab,
   not the repo.
2. **Add the friends.** Sign in as admin → avatar menu → **Admin** → add
   each person's email + display name. Allowlist-only: add them *before*
   they try to sign in. No public signup exists by design.
3. **Railway billing.** Trial credit was nearly exhausted ("0 days / $5").
   Add a payment method so it doesn't pause (~$5/mo for app + Postgres).
4. **Tidy leftover env vars** (harmless but confusing): `SMTP_PORT=587`
   and the placeholder `S3_*` set were auto-added from `.env.example`.
   Remove with `railway variables delete <NAME> -s trivia-trainer`, or
   leave them (RESEND takes priority over SMTP; S3 only matters on upload).
5. **`ALLOW_LOG_MAGIC_LINK`** is NOT set in prod (good — real email works).
   Never set it now that Resend is live; it would print sign-in links to
   logs.
6. **npm audit** still flags `nodemailer`/`cookie`/`postcss` (HIGH, but
   Railway's scanner did NOT block on them — only `next` did, which is
   fixed). Their fixes are risky major/beta bumps; left intentionally.
   Revisit if a real advisory applies.

---

## Deploy gotchas already solved — do NOT regress these

These each caused a failed deploy and are now fixed in-repo. If you change
the Dockerfile, Prisma, or dependencies, keep them in mind:

| Symptom | Root cause | Fix (in repo) |
|---|---|---|
| Railway security scan blocks build | `next@14.2.15` had HIGH CVEs | Pinned `next@^14.2.35` |
| `npm ci` "out of sync" lock error | partial lock after targeted bump | Regenerated `package-lock.json` from clean `npm install`; `npm ci` must exit 0 |
| `ENOENT ...prisma_schema_build_bg.wasm` at migrate | Docker `COPY` flattens the `.bin/prisma` symlink, breaking the CLI's relative wasm lookup | Entrypoint runs `node node_modules/prisma/build/index.js migrate deploy` (real path); `.bin/prisma` not copied |
| `Environment variable not found: DATABASE_URL` | app service had no DB var | `DATABASE_URL=${{Postgres.DATABASE_URL}}` reference |
| `could not locate the Query Engine for linux-musl-openssl-3.0.x` (boot crash-loop) | wrong/missing Prisma engine in Alpine image; Next standalone tracing misses the dynamically-loaded `.so.node` | `binaryTargets = ["native","linux-musl-openssl-3.0.x"]` in schema.prisma + Dockerfile copies `node_modules/.prisma` + `apk add openssl` in builder |
| App configured with wrong values | Railway "auto-add suggested vars" pulled **`.env.example` placeholders** (`http://localhost:3000`, `you@example.com`, etc.) | Set real values via Railway CLI (see runbook) |

Also: admin bootstrap is **non-fatal** in the entrypoint (a hiccup logs a
warning but still starts the app), so a bad `SEED_ADMIN_EMAIL` won't
crash-loop the container.

---

## Operational runbook (Railway CLI)

The CLI is installed (`railway`, v5.8.0) and **linked** to this project on
this machine. The auth token is per-user; if `railway whoami` says
unauthorized, run `railway login` (interactive, opens a browser).

```bash
# from the repo root
railway status                                   # confirm project/env/service
railway variables -s trivia-trainer --kv          # list all env vars (raw values!)
railway variables -s trivia-trainer --set 'KEY=value'   # set one (triggers deploy)
railway variables -s trivia-trainer --set 'KEY=value' --skip-deploys  # set without deploy
railway variables delete KEY -s trivia-trainer    # remove one
railway domain -s trivia-trainer                  # show/create public domain

# Logs (default streams; --lines N = one-shot snapshot)
railway logs --build --lines 40                   # build logs
railway logs -d --lines 40                        # deploy/runtime logs (entrypoint, app)

# Deploy
railway redeploy -s trivia-trainer -y --from-source   # pull + build LATEST commit, then deploy
```

**Healthy boot looks like** (in `railway logs -d`):
```
Applying database migrations… → No pending migrations to apply.
Ensuring admin account… → ✓ Admin ready: <email>
Starting UDM+… → ▲ Next.js 14.2.35 → ✓ Ready
```

**Quick liveness check:** `curl https://trivia-trainer-production.up.railway.app/api/health`
→ `{"status":"ok","db":"up"}`.

### Secrets
`AUTH_SECRET`, `VAULT_KEY`, `RESEND_API_KEY` live only in Railway (and the
owner's password manager) — they are **not** in the repo. View with
`railway variables --kv`. **Never rotate `VAULT_KEY`** once vault entries
exist — it makes them undecryptable.

`TMDB_API_KEY` (optional) powers Now Playing's movie/TV search and poster
art — a TMDB v4 read access token (the long JWT) or v3 key, server-side
only. If unset, the search affordance hides itself and manual entry still
works exactly as before.

---

## Shipping a change

1. Edit code. Verify locally: `npx tsc --noEmit` and `npm run build`
   (the project rule is **no self-driven browser testing** — the owner
   tests in-browser; see CLAUDE.md).
2. Commit. Push to **both** `main` and `claude/serene-feynman-e4tdza`
   (or switch Railway to `main` and push once).
3. Railway auto-deploys the tracked branch on push. To force the latest
   commit + current env: `railway redeploy -s trivia-trainer -y --from-source`.
4. Watch `railway logs -d --lines 40` for the healthy-boot sequence.

If you add a Prisma migration, it applies automatically on the next boot
(entrypoint runs `migrate deploy`). No manual step needed.

---

## Local development

Postgres 16 via Homebrew, DB `udmplus`, role `udm` (needs `CREATEDB` for
Prisma's shadow DB). Full env in `.env` (gitignored; copy from
`.env.example`). With no email provider set, magic-link sign-in **prints
the link to the dev-server stdout** (`src/lib/email.ts`).

```bash
brew services start postgresql@16
npm install
npx prisma migrate dev          # apply migrations
npm run db:seed                 # admin + minimal sample data
npm run dev                     # http://localhost:3000

# Demo data for fuller testing (removable):
npm run db:demo                 # load 3 demo users + content across every module
npm run db:demo:remove          # wipe it (cascade-deletes the demo users)
```

Do **not** commit demo data expectations into prod — `npm run db:seed` in
production (and the boot-time `prisma/bootstrap-admin.mjs`) only create the
admin, never sample data.

---

## Architecture pointers (where things live)

- **Module registry:** `src/modules/registry.ts` — every feature + its
  category (Quests/Shelf/Stash/Arcade), icon, accent, intro/tips. Add a
  module = new folder under `src/modules/<key>` + `src/app/api/...` + one
  registry entry.
- **Shell/nav:** `src/components/NavTabs.tsx` (sidebar + mobile tabs),
  `src/app/(app)/layout.tsx` (header, onboarding, feedback button).
- **Per-tab heroes:** `src/components/Hero.tsx` + each page computes its
  own hero (countdowns, hot ballots, etc.). Click-to-jump via card ids.
- **Onboarding:** `src/components/OnboardingWizard.tsx` (first login) +
  `ModuleIntro.tsx` (per-tab tours). State on `User.onboardedAt` /
  `User.introsSeen`.
- **Avatars:** DiceBear open-peeps, `src/lib/avatar.ts` + `AvatarPicker`.
- **Feedback (for testers):** floating button (`FeedbackButton.tsx`) →
  `/api/feedback` → Admin page triage (`modules/admin/FeedbackList.tsx`).
- **Errors/observability:** `src/app/(app)/error.tsx`, `global-error.tsx`,
  `not-found.tsx`, `/api/health`; API 500s log `[UDM+ 500 <ref>]` and show
  the same ref to the user.
- **Outbox:** every meaningful write also inserts an `OutboxEvent` in the
  same transaction (`src/lib/outbox.ts`) — for a future Discord worker.
- **Auth:** Auth.js v5 magic-link, allowlist-gated (`src/lib/auth.ts`).
  Sign-in only succeeds for emails that already exist in `User`.

---

## Key constraints / agreements

- **No self-driven browser testing.** Verify with `tsc` + build + the
  dev-server compile log, then hand off. The owner does all in-browser
  testing. (Codified in CLAUDE.md and the owner's memory.)
- **Allowlist-only membership.** Admins add members; there is no signup.
- **`VAULT_KEY` is forever.** Don't rotate it post-launch.
