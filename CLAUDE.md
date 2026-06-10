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

## Dev environment
- Postgres 16 via Homebrew (`brew services start postgresql@16`), database
  `udmplus`, role `udm` (has CREATEDB for Prisma's shadow database).
- Magic-link sign-in: with no email provider configured, the link prints to
  the dev-server stdout (`src/lib/email.ts`).
