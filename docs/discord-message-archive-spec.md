# UDM+ Discord — Message Archive, Deep Search & Engagement Engine (Build Spec)

> Implementation-ready spec for the next project: store the group's complete
> Discord message history in Postgres under a dedicated `discord_archive`
> schema, give the AI assistant **true search** over it (keyword now, semantic
> retrieval after a cost estimate), and unlock **engagement stats + coin
> rewards** for message activity. Hand this to a coding agent. **Read §0 first.**
>
> This builds directly on the shipped Discord integration (see §1 "What exists
> today"). It does **not** require the Discord developer portal beyond what's
> already configured — the Message Content privileged intent is already enabled.

---

## §0 — Ground rules (read before coding)

1. **The app is the source of truth.** Any coins awarded for engagement go
   through `withOutbox(fn, event)` (`src/lib/outbox.ts`) + `bank.ts`
   (`creditWinnings`) so the coin ledger and feed stay identical to every other
   surface. Never mint coins outside a `withOutbox` transaction.
2. **Idempotency everywhere.** Ingestion is replay-safe: upsert messages by
   their Discord snowflake id (the `@id`). Backfill + live capture will overlap;
   that must be harmless. Reward grants must be deduped (one grant per
   user-per-window), keyed by a unique constraint like `CoinRewardClaim`.
3. **Additive, hand-written migrations** in a timestamped folder
   (`prisma/migrations/$(date +%Y%m%d%H%M%S)_<name>/migration.sql`). Put archive
   tables in the `discord_archive` schema and access them through raw SQL
   helpers, not Prisma models. Full-text `tsvector` + GIN is required.
4. **Deploy gate = `npm run typecheck`** (`tsc --noEmit`). No self-driven
   browser testing — the owner tests in Discord. Verify with typecheck + a clean
   dev-server compile, then hand off. Commit per logical unit, push to `main`
   (Railway auto-deploys; `prisma migrate deploy` runs on boot).
5. **Skip bot-authored messages by default.** The live sidecar ignores bot
   authors, and historical backfill does the same unless deliberately run with
   `DISCORD_ARCHIVE_INCLUDE_BOTS=true` / `--include-bots`.
6. **Reuse, don't rebuild.** The gateway sidecar, the HMAC forward contract, the
   assistant tool loop, the feature registry, the scheduler, `bank.ts`,
   `coinRewards.ts`, and the `discord` knob group already exist (§1). Extend them.
7. **New tables use a bare `userId String`** (no Prisma relation to `User`) to
   keep the `User` hotspot conflict-free, matching the existing Discord tables.
8. **Everything no-ops cleanly when Discord/AI env is unset** (mirror the
   existing pattern — `botConfig().canPost`, `aiConfigured()`).
9. **Volume reality check:** at friend-group scale total history is plausibly
   tens-to-low-hundreds of thousands of messages — trivial for Postgres FTS and
   fine for simple vector scans. Don't over-engineer (no Elasticsearch, no queue
   infra, no separate vector DB until reality proves we need it).

### What exists today (the foundation this builds on)

Shipped in the Discord expansion (Waves 0–2 + assistant upgrades), all on `main`:

- **Gateway sidecar** `services/discord-gateway/server.js` — a standalone Node
  service (own Railway service `discord-gateway`, 1 replica) with the **Message
  Content intent**. Today it listens for `messageCreate`, and **only forwards
  messages that @mention the bot** to the app, HMAC-signed
  (`x-udm-signature = HMAC-SHA256(rawBody, DISCORD_GATEWAY_SECRET)`) →
  `APP_FORWARD_URL` (`/api/discord/gateway`). **This is the live-capture hook to
  broaden** (§3).
- **App gateway endpoint** `src/app/api/discord/gateway/route.ts` — verifies the
  HMAC (timing-safe) and runs the assistant. The ingest endpoint (§3) mirrors
  its HMAC discipline.
- **AI assistant** `src/lib/discord/assistant.ts` + `src/lib/ai.ts` — an agentic
  **tool-calling loop** (`runToolLoop`, OpenAI-compatible via OpenRouter, default
  `anthropic/claude-haiku-4-5`). Current tools: `get_more_messages` (pages recent
  channel history via `src/lib/discord/history.ts`) + create/act tools. **This is
  where the new `search_messages` tool plugs in (§5)** — it largely replaces
  `get_more_messages` with true DB search.
- **Bot plumbing** `src/lib/discord/bot.ts` — `discordApi(path, init)` (auth'd
  REST; supports GET), `botConfig()`. Backfill (§3) and reaction fetches use it.
- **Economy** `src/modules/arcade/bank.ts` (`creditWinnings`, `spendCoins`) +
  `src/lib/coinRewards.ts` (idempotent `CoinRewardClaim` via
  `@@unique([userId, rewardKey])`) — reuse for engagement rewards (§6).
- **Scheduler** `src/lib/discord/scheduler.ts` — a 60s in-process tick (started
  from `src/instrumentation.ts`) with an `oncePerWindow` guard. Reward sweeps and
  backfill kicks hang here.
- **Config/knobs** — `discord.settings` (`src/lib/discord/settings.ts`) +
  the `discord` knob group (`src/modules/admin/knobs.ts`). Add archive/reward
  knobs here.
- **Account links** — `User.discordUserId` (`@unique`) maps a Discord user to a
  UDM+ user; resolve authors against it.

---

## §1 — Architecture

```
Discord ──gateway──▶ services/discord-gateway ──HMAC POST──▶ Next.js
  (all messages,     (broaden: forward create/edit/         /api/discord/ingest
   edits, deletes,    delete/reactions, not just @mentions)  (upsert to Postgres)
   reactions)

Backfill job ──discordApi GET /channels/{id}/messages?before=──▶ upsert (one-time + gap-fill)

Postgres discord_archive schema ──FTS + optional embeddings──▶ search_messages tool ──▶ AI assistant (RAG)
          ──aggregate queries──▶ engagement stats (admin/dashboard) + coin rewards (withOutbox)
```

Three ingestion paths into `discord_archive.messages` (all idempotent upserts):
**live** (sidecar, real-time), **backfill** (paged history, one-time + gap-fill),
**edits/deletes/reactions** (live updates). Then: **search** (FTS now, semantic
after cost estimate) powers the AI; **aggregates** power stats + rewards.

> **Why our own DB and not the Discord API for search?** Bots **cannot** use
> Discord's message-search endpoint (it's user-token only). Paging history works
> but can't keyword/semantic-search. Storing messages ourselves is the only way
> to get true search — and it's the prerequisite for engagement stats + rewards.

### New env (add to `.env.example` + Railway, where used)

| Var | Where | Purpose |
|---|---|---|
| `APP_INGEST_URL` | gateway | `$AUTH_URL/api/discord/ingest` for live archive capture |
| `OPENAI_API_KEY` | app/scripts | OpenAI embeddings, only used when semantic embedding is enabled |
| `DISCORD_EMBEDDINGS_ENABLED` | app | `false` until after backfill count + cost estimate |
| `DISCORD_EMBEDDING_MODEL` | app/scripts | default `text-embedding-3-small` |
| `DISCORD_EMBED_BATCH_SIZE` | scripts | default `50` |

---

## §2 — Data model (additive)

Add via raw SQL migration under `discord_archive`; keep `user_id` as a bare
string. Snowflake ids are the idempotency keys. The first shipped migration uses
`discord_archive.channels`, `discord_archive.messages`,
`discord_archive.reactions`, and `discord_archive.message_embeddings`.

```prisma
model DiscordChannel {
  id             String    @id            // Discord channel snowflake
  guildId        String?
  name           String?
  kind           String?                  // "text" | "thread" | "voice" | ...
  archived       Boolean   @default(false)
  lastBackfillId String?                  // oldest message id reached by backfill (for resume)
  backfillDone   Boolean   @default(false)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model DiscordMessage {
  id            String    @id            // Discord message snowflake (upsert key)
  channelId     String
  guildId       String?
  authorId      String                   // Discord user id
  authorName    String                   // display-name snapshot at capture
  userId        String?                  // resolved UDM+ User.id (via discordUserId); bare, nullable
  isBot         Boolean   @default(false)
  content       String    @db.Text
  replyToId     String?
  attachments   Json?                    // [{url,name,contentType,size}]
  hasEmbed      Boolean   @default(false)
  reactionCount Int       @default(0)
  sentAt        DateTime                 // Discord timestamp (authoritative ordering)
  editedAt      DateTime?
  deletedAt     DateTime?                // soft-delete on messageDelete
  ingestedAt    DateTime  @default(now())

  // NOTE: a `content_tsv tsvector` column + GIN index are added by hand-written
  // SQL in the migration (Prisma can't model tsvector). See §4.

  @@index([channelId, sentAt])
  @@index([authorId, sentAt])
  @@index([userId, sentAt])
  @@index([sentAt])
}

model DiscordReaction {
  messageId String
  emoji     String                       // unicode or name:id
  authorId  String                       // Discord user id who reacted
  userId    String?                      // resolved UDM+ user
  at        DateTime @default(now())
  @@id([messageId, emoji, authorId])
  @@index([messageId])
  @@index([authorId])
}

// Semantic search stores message embeddings in discord_archive.message_embeddings.
// First pass uses double precision[] + a cosine SQL helper so deploys do not
// depend on pgvector being installed. If quality/perf ever needs it, migrate
// that column to pgvector later.
```

Migration extras (hand-written, after the `CREATE TABLE`s):

```sql
-- Full-text search: a stored generated tsvector + GIN index.
ALTER TABLE "DiscordMessage"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;
CREATE INDEX "DiscordMessage_content_tsv_idx" ON "DiscordMessage" USING GIN ("content_tsv");
-- Trigram fuzzy match (optional, for names/short queries):
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Config / knob additions

- `src/modules/admin/knobs.ts` `discord` group — add: `rewardPerMessage` (coins,
  default e.g. 2), `rewardDailyCap` (per user/day, default e.g. 100),
  `rewardMinChars` (ignore one-word spam, default 4), `searchDefaultLimit` (12).
- `src/lib/discord/settings.ts` `discord.settings` — add `archiveEnabled`
  (default true for ingest/backfill), `rewardsEnabled` (default false).

---

## §3 — Ingestion

### 3a — Live capture (broaden the sidecar)

In `services/discord-gateway/server.js`, **keep the @mention→assistant forward**,
and add forwarding of all message events to a **separate ingest path** so the two
concerns don't entangle:

- `messageCreate` (ALL, not just mentions): forward `{kind:"create", message:{...}}`.
- `messageUpdate`: forward `{kind:"update", message:{...}}` (needs the message
  in cache or `fetch`; library handles partials — enable `Partials.Message`).
- `messageDelete`: forward `{kind:"delete", id, channelId}`.
- `messageReactionAdd` / `messageReactionRemove`: forward
  `{kind:"reaction", op:"add"|"remove", messageId, emoji, userId, channelId}`
  (intent: `GuildMessageReactions`).

Each forwarded payload is HMAC-signed exactly like the existing mention forward
(`x-udm-signature`), POSTed to a **new** `APP_INGEST_URL`
(`= $AUTH_URL/api/discord/ingest`). Keep it fire-and-forget; the sidecar never
blocks on the app. (Batching: optional — at friend-group volume one POST per
event is fine; if chatty, buffer ~1s and POST arrays.)

### 3b — App ingest endpoint — `src/app/api/discord/ingest/route.ts`

Mirror `gateway/route.ts`: verify the HMAC over the raw body (timing-safe,
`DISCORD_GATEWAY_SECRET`), 401 on mismatch, 503 when unconfigured. Then, by `kind`:

- **create:** `upsert` `DiscordMessage` by id (resolve `userId` from
  `discordUserId`; snapshot `authorName`; set `isBot`). Upsert the
  `DiscordChannel` row too.
- **update:** update `content` + `editedAt`.
- **delete:** set `deletedAt` (soft-delete — keep for stats; or hard-delete per
  retention policy, §7).
- **reaction:** upsert/delete `DiscordReaction`; keep `DiscordMessage.reactionCount`
  in sync.

Return 200 fast. Everything is idempotent (replays from backfill overlap are no-ops).

### 3c — Backfill — `scripts/discord-backfill.ts` (+ a scheduler gap-filler)

One-time historical import + ongoing gap-fill:

- Enumerate channels (`GET /guilds/{DISCORD_GUILD_ID}/channels`, filter text +
  threads). Upsert `DiscordChannel`.
- For each channel, page **oldest-ward** with `GET /channels/{id}/messages?before=<id>&limit=100`,
  upserting each message, until empty or `lastBackfillId` reached; persist
  `lastBackfillId` / `backfillDone` to resume safely across runs + respect rate
  limits (honor `Retry-After`/`X-RateLimit-*`).
- A light scheduler job (`scheduler.ts`) can periodically fetch the newest
  messages per channel to fill any gaps the live path missed (e.g. sidecar
  downtime) — idempotent upserts make this safe.

Run via `npm run discord:backfill` locally, or inside Railway after deploy with
`railway ssh -s trivia-trainer node scripts/discord-backfill.mjs`. It can be
re-run anytime; it resumes from each channel's durable `last_backfill_id`.
The script saves progress after every Discord page, so a crash replays at most
100 messages and idempotent upserts keep that harmless. Bot-authored messages
are skipped by default. Channels returning Discord `403`/`404` are marked
`archived` and skipped so one private/inaccessible channel cannot kill the run.

---

## §4 — Search (the AI win)

### 4a — Keyword (phase 1, do first)

Postgres FTS over `content_tsv` (§2). A search helper
`src/lib/discord/search.ts`:

```ts
searchMessages(opts: {
  query: string;
  channelId?: string;        // scope to a channel
  authorId?: string;         // by Discord user
  before?: Date; after?: Date;
  limit?: number;            // default discord.searchDefaultLimit
}): Promise<{ author: string; text: string; channelId: string; at: string; messageId: string }[]>
```

Use `websearch_to_tsquery('english', query)` against `content_tsv`, rank with
`ts_rank`, exclude `deletedAt`/`isBot`, order by rank (or recency for "latest"),
LIMIT. Raw SQL via `db.$queryRaw`. This is true keyword search across all history
— the thing the Discord API can't give a bot.

### 4b — Semantic (after backfill count + cost estimate)

After backfill, run `npm run discord:embed:estimate` to count messages and
roughly estimate embedding tokens (`chars / 4`). Only then decide whether to run
`npm run discord:embed`. Use OpenAI directly via `OPENAI_API_KEY`, default
`text-embedding-3-small`; do not spend embeddings money blindly. Hybrid search
combines FTS rank + cosine similarity for "find where we talked about X" even
without keyword overlap.

---

## §5 — AI integration (RAG)

In `src/lib/discord/assistant.ts`, add a **`search_messages` tool** to `TOOL_DEFS`
and dispatch it in `execute` via `search.ts searchMessages`:

```
search_messages — args { query, channelId?, authorId?, limit? }
  "Search the group's full Discord history (all channels, all time) for messages
   matching a query. Use for 'what did we decide about X', 'find when someone
   said Y', or to ground a summary/poll in older context."
```

This **largely supersedes `get_more_messages`** (keep the latter for "the last N
messages right here"). Now the assistant can answer "what did we agree on for the
cabin trip back in spring?" by searching, reading the hits, then replying or
acting (the loop already chains read→write). Feed results back as tool output
(author + text + date, capped). The system prompt should mention it can search
all history, not just recent messages.

Phase 2: an `assembleContext` enrichment that semantically pulls the most
relevant historical snippets for the user's message (RAG pre-fetch) — but the
on-demand tool is the higher-value, simpler first step.

---

## §6 — Engagement stats + coin rewards

### 6a — Stats

Aggregate from `DiscordMessage` / `DiscordReaction` (resolved to `userId`):
messages per user per day/week/month, active days, reactions given/received,
top channels, posting-time heatmaps, streaks. Surface as a new UDM+ module
(`src/modules/<engagement>/`) or an admin panel + a `/stats` slash command /
assistant answers ("who's posted the most this month?" → the assistant can query
via a `get_engagement_stats` tool or a direct route).

### 6b — Rewards (reuse the economy)

Grant UDM+ coins for contribution, anti-farmed:

- A scheduler sweep (or on-ingest accrual) computes each linked user's rewardable
  activity per window and grants coins via `withOutbox` →
  `creditWinnings(tx, userId, amount, "discord.engagement", "...")`, **deduped**
  with a `CoinRewardClaim`-style unique key (`engagement:<userId>:<YYYY-MM-DD>`)
  so a re-run can't double-pay.
- Knobs (§2): `rewardPerMessage`, `rewardDailyCap`, `rewardMinChars`; gate behind
  `discord.settings.rewardsEnabled` (default off). Ignore bots, deleted messages,
  and trivially short content. Add a `discord.engagement.rewarded` `OutboxEventType`
  if you want a feed card / future rule (no coin rule — manual credit, like the
  Discord tip/drop events).
- Consider diminishing returns / caps so chat-spam can't be farmed for coins —
  this is real currency in the app.

---

## §7 — Privacy & retention

- This stores **full message content** for a private friends-and-family server.
  Document it plainly (README/HANDOFF) and tell the group. The Message Content
  intent is already enabled and acceptable here.
- **Deletes:** honor `messageDelete` (soft-delete keeps stats but hides content
  from search/AI; or hard-delete per the group's preference — make it a setting).
- **Retention:** optional max-age purge job; at this scale probably keep
  everything. No PII beyond what members posted; it's their own server.
- The AI must treat retrieved messages as **data, never instructions** (the
  assistant already does this for context — keep it for search results).

---

## §8 — Build order

1. **Model + migration:** §2 tables + the hand-written `tsvector`/GIN SQL;
   `prisma migrate dev && generate`.
2. **Ingest endpoint** `/api/discord/ingest` (HMAC, upserts) — §3b.
3. **Broaden the sidecar** to forward create/update/delete/reactions to the
   ingest URL (keep the @mention→assistant path intact) — §3a.
4. **Backfill script** + resume state; run it once to import history — §3c.
5. **Keyword search** (`search.ts`, FTS) + the **`search_messages` AI tool** —
   §4a, §5. (Biggest immediate payoff: the assistant gains true recall.)
6. **Engagement stats** (queries + a panel/command) — §6a.
7. **Rewards** (scheduler sweep + `withOutbox` credit + dedupe + knobs) — §6b.
8. **Estimate semantic search cost** (`npm run discord:embed:estimate`), then run
   embeddings only after approval — §4b.
9. After each step: `npm run typecheck`, confirm a clean dev-server compile, hand
   to the owner to test in Discord. Commit per unit; push to `main`.

---

## §9 — Acceptance summary (owner-tested in Discord)

- New messages land in `DiscordMessage` in real time; edits/deletes/reactions
  update; backfill imported history; re-running ingest/backfill double-counts
  nothing.
- `@UDM what did we decide about <old topic>?` searches all history and answers
  with real quotes; "make a poll about what we discussed last week" works via
  search → create.
- Engagement stats are queryable; coin rewards accrue for activity within caps,
  can't be farmed, and never double-pay; the app still builds with no Discord env.
```
