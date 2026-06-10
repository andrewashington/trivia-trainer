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
  We evaluate changes in production, not in elaborate review flows. Once a
  change typechecks cleanly, get it deployed: commit, push, and merge to the
  deploy branch (`claude/serene-feynman-e4tdza`) without waiting for a
  separate local sign-off. Railway runs `prisma migrate` on boot, so additive
  migrations ship automatically. Don't ask whether to merge — just do it
  unless the change is genuinely risky (destructive migration, data loss).

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
