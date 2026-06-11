# UDM+ — working agreements

## Testing
- **Never launch browser previews or drive the app yourself** (no preview_*
  tools, no headless sign-in flows, no screenshots). The user always does
  all in-browser testing personally. Verify changes with `npx tsc --noEmit`
  and by checking the dev-server log compiles cleanly — then hand off.
- Run the dev server with `npm run dev` as a plain background process on
  port 3000; don't wrap it in preview tooling.

## Deploying
- **This is a personal-use-only app — take the most direct route to prod.**
  We evaluate changes in production, not in elaborate review flows. There are
  no PRs and no merge dance: **commit straight to `main` and push.** Railway
  auto-deploys `main` on push and runs `prisma migrate` on boot, so additive
  migrations ship automatically. Don't ask whether to push — just do it,
  unless the change is genuinely risky (destructive migration, data loss).
- **The one pre-deploy gate is `npm run typecheck` (i.e. `tsc --noEmit`).**
  Type errors fail the Railway build (`next.config` keeps `tsc` strict), so a
  green typecheck is what "confident in the deploy" means here. That's the
  whole gate — nothing heavier is required.
- **Lint is NOT a gate.** `next.config` sets `eslint.ignoreDuringBuilds:
  true`, and `main` carries some pre-existing lint noise, so a failing
  `npm run lint` does not block a deploy. Don't gate on it or stop to fix
  unrelated lint findings; only tidy lint in files you're already touching.
- For a genuinely risky change, optionally run `npm run build` locally for
  fuller confidence (catches build-time issues beyond types) — but it's not
  required; we're happy to verify in prod and roll back.

### Rolling back a bad deploy
A broken deploy is cheap to undo — prefer rollback over heavier gatekeeping:
- **Fastest:** Railway dashboard → service → Deployments → pick the last good
  deploy → Redeploy/Rollback. No git changes needed.
- **Via git:** `git revert <bad-sha> && git push` — ships a clean forward
  commit that undoes the change and triggers a fresh deploy. Use this when
  you want `main` itself to reflect the rollback.
- Avoid `push --force` to roll back; a `revert` keeps history honest and
  doesn't break other clones.

### The lockfile trap (read before committing deps)
Railway's Dockerfile builds with **Node 22 + `npm ci`**, which hard-fails if
`package-lock.json` is even slightly out of sync with `package.json`.
`tsc`/typecheck does NOT catch this — it only shows up in the Railway build.
- **Don't commit incidental lockfile churn.** A local `npm install` on a
  different Node/npm version (e.g. Node 25) silently rewrites
  `package-lock.json` (hoisting, optional peers like nodemailer). If you
  didn't intentionally change deps, **don't stage that diff** — restore it:
  `git checkout origin/main -- package-lock.json`.
- **Never `git add -A` blindly.** Stage the files you actually changed;
  review `git status` first so an unrelated lockfile rewrite doesn't ride
  along.
- **When you DO add/remove a dep:** change `package.json`, run `npm install`
  to update the lockfile, commit both together. If the Railway build then
  rejects the lockfile, it's a Node-version mismatch — match Railway by
  using Node 22 locally (`nvm use 22`; the repo pins it via `.nvmrc`).

## Parallel sessions
Multiple Claude sessions often work this repo at once, each on its own
feature. Keep that cheap:

- **Stay in your lane.** A feature = its module dir (`src/modules/<x>/`),
  its routes (`src/app/(app)/<x>/`, `src/app/api/<x>/`), and new files.
  Don't refactor shared code (`src/lib`, `src/components`) unless that IS
  the feature.
- **Expect remote `main` to move.** Before pushing: `git pull --rebase
  origin main`, then re-run `npx tsc --noEmit`. If errors mention missing
  Prisma models, another session shipped a migration — run
  `npx prisma migrate dev && npx prisma generate` and re-check.
- **Known merge hotspots** (small, easy conflicts — just resolve and move
  on): `src/modules/registry.ts` (every new module registers here),
  `tailwind.config.ts` (accent colors), `src/lib/outbox.ts` (event-type
  union), `prisma/schema.prisma`.
- **Migrations: additive only, hand-written SQL**, in a folder named with
  a real current timestamp (`date +%Y%m%d%H%M%S`) so parallel sessions'
  migrations sort correctly.
- **Commit per feature, push promptly.** Small frequent pushes keep
  rebases trivial; a long-lived dirty tree is what makes parallel
  sessions painful.
- Accent colors are mostly claimed — check `src/modules/registry.ts`
  before picking one; add a new hex to `tailwind.config.ts` if needed.

## Dev environment
- Postgres 16 via Homebrew (`brew services start postgresql@16`), database
  `udmplus`, role `udm` (has CREATEDB for Prisma's shadow database).
- Magic-link sign-in: with no email provider configured, the link prints to
  the dev-server stdout (`src/lib/email.ts`).
