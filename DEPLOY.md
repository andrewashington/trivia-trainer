# Deploying UDM+

A friend-group deploy, start to finish. Recommended host is **Railway**
(Postgres + the Dockerfile in one place, with migrations and the admin
account created automatically on first boot). Render works the same way.

The whole thing takes ~30 minutes. Go phase by phase.

---

## What you need

- A **GitHub** account (the code lives here; Railway deploys from it).
- A **Railway** account (railway.app) — free trial, then ~$5/mo.
- An **email sender** so magic-link sign-in works. Two options:
  - **Resend** (resend.com) + a domain you own — best, most reliable.
  - **Gmail SMTP** (an app password) — zero cost, no domain needed.
- *(Optional)* **Cloudflare R2** for file/photo uploads (Files tab,
  Market photos, recipe photos). Skip it and everything else still works.

---

## Your secrets

Generate two strong secrets and store them somewhere safe (a password
manager) — **not** in this repo:

```bash
openssl rand -base64 32   # use for AUTH_SECRET
openssl rand -base64 32   # use for VAULT_KEY
```

`VAULT_KEY` encrypts the shared Vault passwords. **Never change it after
launch** — rotating it makes existing vault entries undecryptable.

---

## Phase 1 — Push the code to GitHub

From the project folder:

```bash
git add -A
git commit -m "Prepare UDM+ for deploy"
git push origin main
```

If `main` doesn't exist yet, create the repo on GitHub first, then:

```bash
git branch -M main
git remote add origin https://github.com/<you>/udm-plus.git
git push -u origin main
```

---

## Phase 2 — Email sender

### Option A — Resend + your domain (recommended)
1. Sign up at resend.com → **API Keys** → create one → copy it
   (`re_...`). This is `RESEND_API_KEY`.
2. **Domains** → add your domain → add the DNS records it shows to your
   registrar. Wait for "Verified".
3. Your `EMAIL_FROM` becomes e.g. `UDM+ <login@yourdomain.com>`.

No domain yet? You can test with Resend's sandbox, but it only delivers
to *your own* signup email — fine for solo testing, not for friends. For
friends, verify a domain or use Option B.

### Option B — Gmail SMTP (no domain)
1. Google account → enable 2-Step Verification → create an **App
   Password** (Google account → Security → App passwords).
2. You'll set these env vars instead of `RESEND_API_KEY`:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=you@gmail.com`
   - `SMTP_PASS=<the 16-char app password>`
   - `EMAIL_FROM=UDM+ <you@gmail.com>`

---

## Phase 3 — Create the Railway project

1. railway.app → **New Project** → **Deploy from GitHub repo** → pick
   your `udm-plus` repo. Railway detects the Dockerfile.
2. In the same project: **New** → **Database** → **Add PostgreSQL**.
3. Open your **app service** → **Variables** → add the following.

### Required variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the Postgres service) |
| `AUTH_SECRET` | the `AUTH_SECRET` above |
| `VAULT_KEY` | the `VAULT_KEY` above |
| `AUTH_URL` | `https://TEMP` (fixed in Phase 4) |
| `SEED_ADMIN_EMAIL` | **your** email — you become the admin |
| `SEED_ADMIN_NAME` | your name |
| `MAX_FILE_SIZE_MB` | `25` |

### Email variables
Add **either** `RESEND_API_KEY` + `EMAIL_FROM` (Option A) **or** the four
`SMTP_*` vars + `EMAIL_FROM` (Option B).

> Tip: type `${{Postgres.DATABASE_URL}}` literally — Railway resolves the
> reference so the app and database always agree.

---

## Phase 4 — Generate the domain, then point AUTH_URL at it

1. App service → **Settings** → **Networking** → **Generate Domain**.
   You'll get something like `udm-plus-production.up.railway.app`.
2. Go back to **Variables** and set:
   `AUTH_URL = https://udm-plus-production.up.railway.app` (your real URL,
   no trailing slash).
3. Railway redeploys. On boot it runs migrations and creates your admin
   account automatically (watch the deploy logs for `✓ Admin ready`).

---

## Phase 5 — Verify it's live

1. Visit `https://<your-domain>/api/health` → should show
   `{"status":"ok","db":"up",...}`. If `db:"down"`, `DATABASE_URL` is
   wrong.
2. Visit the site → enter your `SEED_ADMIN_EMAIL` → check your inbox for
   the magic link → sign in. You'll land in the first-run wizard.
3. (If the email never arrives, check the deploy logs and your email
   provider's dashboard. With SMTP, Gmail sometimes needs the app
   password re-pasted with no spaces.)

---

## Phase 6 — Add your friends

There is **no public signup** — that's the point. You add people:

1. Sign in as admin → tap your avatar → **Admin**.
2. Under members, add each friend's **email + display name**.
3. Tell them to visit the site and sign in with *that exact email*.
   They'll get a magic link, then their own onboarding wizard.

Only allowlisted emails can sign in — add the person *before* they try.

---

## Phase 7 *(optional)* — File & photo uploads with Cloudflare R2

Skip this and Files/photo features just show friendly errors; everything
else works. To enable:

1. Cloudflare dashboard → **R2** → create a bucket (e.g. `udmplus`).
2. **R2 → Manage API Tokens** → create one with read/write → note the
   Access Key ID, Secret, and your account's S3 endpoint.
3. Add these app variables and redeploy:
   - `S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`
   - `S3_REGION=auto`
   - `S3_BUCKET=udmplus`
   - `S3_ACCESS_KEY_ID=...`
   - `S3_SECRET_ACCESS_KEY=...`
   - `S3_FORCE_PATH_STYLE=false`

---

## Collecting feedback while they test

- Every page has a **Feedback** button (bottom-left): bug / idea / love,
  with the page path attached. Reports land on your **Admin** page, where
  you can mark them resolved.
- Server errors show users a friendly screen with a `ref:` code; the same
  code appears in your Railway logs (`[UDM+ 500 XXXXXX]`) so you can match
  a screenshot to a log line.
- `GET /api/health` is your uptime check (point an uptime monitor at it).

---

## Updating the app later

Push to `main` → Railway auto-deploys. New database migrations run
automatically on boot; the admin bootstrap is idempotent and safe to
re-run.
