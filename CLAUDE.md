# UDM+ — working agreements

## Testing
- **Never launch browser previews or drive the app yourself** (no preview_*
  tools, no headless sign-in flows, no screenshots). The user always does
  all in-browser testing personally. Verify changes with `npx tsc --noEmit`
  and by checking the dev-server log compiles cleanly — then hand off.
- Run the dev server with `npm run dev` as a plain background process on
  port 3000; don't wrap it in preview tooling.

## Dev environment
- Postgres 16 via Homebrew (`brew services start postgresql@16`), database
  `udmplus`, role `udm` (has CREATEDB for Prisma's shadow database).
- Magic-link sign-in: with no email provider configured, the link prints to
  the dev-server stdout (`src/lib/email.ts`).
