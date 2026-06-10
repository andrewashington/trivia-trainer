# Discord Integration — Scope

Status: **Phases 1–2 shipped** (bot + linking; RSVP/Vote/Claim/Upvote buttons on feed cards). Phase 3 (slash commands) open — claim it by updating this doc.

## Where we are

One-way notifications work well today: the outbox drainer
(`src/lib/discord/drainer.ts`) polls `OutboxEvent`, renders brutalist PNG
cards (`src/lib/discord/card.tsx`), and posts 13 highlight event types to a
channel via `DISCORD_WEBHOOK_URL`. Nothing flows back.

## Goal

A real Discord **bot** (application) alongside the webhook flow, used only
where Discord is a *natural* surface — quick reactions, votes, claims,
glances — never a full mirror of the app. The app stays the source of truth;
every Discord write goes through the same API-layer invariants
(`withOutbox`, ownership checks).

## Architecture decisions

1. **HTTP interactions endpoint, not a gateway websocket.** Discord supports
   an "Interactions Endpoint URL": Discord POSTs slash commands / button
   clicks to us. This fits the single Next.js container on Railway — no
   second process, no websocket to babysit. Route:
   `src/app/api/discord/interactions/route.ts`, Ed25519 signature
   verification (`discord-interactions` npm or tweetnacl), public (no
   session auth — signature IS the auth).
2. **Bot-token posting replaces the webhook for cards that need buttons.**
   Webhook messages can't carry interactive components; bot messages can.
   The drainer keeps its exact shape (poll, batch, retry, PNG cards) but
   posts via `POST /channels/{id}/messages` with the bot token, attaching
   component rows per event type. Plain webhook stays as fallback when no
   bot token is configured.
3. **Identity = `User.discordUserId`** (already on the schema, unique,
   unused). Linking via a short-lived code: `/link` in Discord → ephemeral
   reply with a 6-char code → user enters it on `/settings` in the app
   (signed in) → row updated. No Discord OAuth provider needed; auth stays
   magic-link-only. New table: `DiscordLinkCode(code, discordUserId,
   discordUsername, expiresAt)` — additive migration.
4. **3-second rule:** interactions must be ACKed in 3s. Anything touching
   the DB responds with a deferred ack, then follows up via the
   interaction-token webhook.
5. **Command registration** is a script (`npm run discord:register`) hitting
   the application-commands REST endpoint — run manually when commands
   change; not part of boot.

New env (Railway + `.env.example`): `DISCORD_APP_ID`,
`DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`.
`DISCORD_WEBHOOK_URL` remains for fallback.

## Phases

### Phase 1 — Bot foundation + linking
- Discord application + bot created, invited to the server.
- `/api/discord/interactions` route with signature verification, PING/PONG,
  command dispatcher.
- `npm run discord:register` script.
- `/link` command + code-entry box on the settings/profile page; `/unlink`.
- Drainer posts via bot token when configured (no components yet).
- A linked user's actions in Discord resolve to their UDM+ user; unlinked
  users get an ephemeral "link your account" nudge with instructions.

### Phase 2 — Interactive cards (the payoff)
Attach buttons to existing outbox cards; clicks call the same logic as the
app's API routes (extract shared helpers where needed, but stay in-lane —
prefer calling module service functions over duplicating logic):
- `event.created` → **Going / Maybe / Out** buttons (upserts RSVP, emits
  `event.rsvp.changed`; update the message's button counts on click).
- `poll.created` → **Vote** button → Discord select-menu/modal with the
  options (respects single/multi; anonymous polls stay anonymous —
  ephemeral confirmation only).
- `listing.created` → **Claim** button (same atomic first-come-first-served
  claim; on success edit card to CLAIMED, on race reply ephemerally "too
  slow").
- `idea.created` → **▲ Upvote** button.

### Phase 3 — Slash commands (reads + light writes)
- `/events` — next 5 upcoming events with RSVP status.
- `/countdowns` — active clocks.
- `/coins [user]` — balance + recent ledger lines.
- `/pet` — pet mood + **Nudge** button (`pet.nudged`).
- `/wishlist add <url>` — quick capture (og-preview enrichment already
  exists server-side).
- `/idea <text>` — pitch from Discord.

### Explicitly out of scope
- **Vault** (secrets never transit Discord), **Files** (private links),
  admin actions, arcade *gameplay* (scores still announce via cards),
  recipes/contacts editing, DM-based notification preferences (revisit
  later), Discord role/permission sync.

## Risks / gotchas
- Railway URL must be set as the Interactions Endpoint URL in the Discord
  dev portal; Discord validates it live (sends a signed PING) — deploy the
  route before saving the URL.
- Signature verification needs the **raw** request body (read text before
  JSON.parse in the route handler).
- Button `custom_id` is the only state you get back — encode
  `action:entityId` (≤100 chars), never trust it without re-checking the
  entity in the DB.
- Drainer and interactions both write outbox events — fine, but card posts
  triggered by Discord clicks shouldn't loop (the 13-event highlight filter
  already prevents most echo; `event.rsvp.changed` cards are desirable echo).
