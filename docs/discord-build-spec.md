# UDM+ Discord — Full Build Spec

> Implementation-ready spec for the next-level Discord integration. Hand this to
> a coding agent. It builds on the live integration documented in
> [discord-integration-scope.md](discord-integration-scope.md). **Read §0 first.**
>
> Decisions already locked by the owner: even blend of do-more / dazzle / funnel;
> **full coin economy in Discord** (claim, tip, micro-games); **true `@mention`
> natural-language flow is a first-class goal**, delivered via a new gateway
> sidecar; modals + DMs + Components V2 + "fresh" delights; **World features are
> deferred but the architecture must leave a clean seam for them.**

---

## §0 — Ground rules (read before coding)

1. **The app is the source of truth.** Every Discord write goes through the same
   invariants as the web app: wrap mutations in `withOutbox(fn, event)`
   (`src/lib/outbox.ts`) so coins (`src/lib/coins.ts`) and the feed stay
   identical to in-app actions. Never write coins or domain rows outside a
   transaction that also emits the outbox event.
2. **Re-validate everything.** A button/menu `custom_id` is just an address
   (`action:...:entityId`, ≤100 chars). Refetch the entity and re-apply guards
   on every interaction — never trust the id. This matters double once real
   coins move on a click (idempotency).
3. **Deploy gate = `npm run typecheck` (tsc --noEmit).** That is the whole gate
   (`next.config` keeps tsc strict; eslint is not a gate). No self-driven
   browser testing — the owner tests in Discord personally. Verify with
   typecheck + a clean dev-server compile, then hand off.
4. **Migrations: additive only, hand-written SQL**, in a folder named with a
   real timestamp: `prisma/migrations/$(date +%Y%m%d%H%M%S)_<name>/migration.sql`.
   Add the model to `prisma/schema.prisma`, write the SQL, run
   `npx prisma migrate dev && npx prisma generate`. Railway runs
   `migrate deploy` on boot.
5. **Merge hotspots — touch surgically:** `src/lib/outbox.ts` (the
   `OutboxEventType` union), `src/lib/coins.ts` (`COIN_RULES`),
   `src/lib/appConfig.ts` (`AppConfigKey` union), `src/modules/admin/knobs.ts`
   (`KNOB_REGISTRY`), `prisma/schema.prisma`. Add lines; don't reflow.
6. **New tables use a bare `userId String` column, not a Prisma relation to
   `User`.** Keeps the `User` model (a hotspot) untouched and conflict-free.
7. **The bot no-ops cleanly when unconfigured.** Mirror the existing pattern:
   every entry point checks `botConfig().canPost` / env presence and returns
   early. The app must still build and run with no Discord env set.
8. **Ship per wave.** Each wave below is independently shippable and adds value
   on its own. Build in order; don't start a wave before its backbone deps.

### What exists today (don't rebuild)

- HTTP interactions endpoint: `src/app/api/discord/interactions/route.ts` →
  `src/lib/discord/interactions.ts` (dispatcher, ~18 slash commands, RSVP /
  poll / claim / idea / pet buttons).
- Outbox drainer posting brutalist PNG cards: `src/lib/discord/drainer.ts`,
  `card.tsx`, `webhook.ts`, `feed.ts` (13 highlight events, admin-toggleable).
- Bot plumbing: `src/lib/discord/bot.ts` — `DISCORD_API`, `botConfig()`,
  `discordApi(path, init)`, `verifyInteractionSignature(...)`.
- Account linking: `/link` → code → `/me`; `User.discordUserId` (unique).
- Command registration script: `scripts/register-discord-commands.ts`
  (`npm run discord:register`, bulk PUT of global commands).
- Economy engine: `src/modules/arcade/bank.ts` — `spendCoins`, `debitStake`,
  `creditWinnings`, `logRound`, `validateBet`, `payout`, `rollLimbo`,
  `rollCrashPoint`, `minesMultiplier`, `placeMines`. Live knobs via
  `getGameKnobsCached("arcade")`.
- Daily promo / claim helpers: `src/lib/coinRewards.ts` — `effectiveRewards()`,
  `findRewardEffective(key)`, `claimKeyFor(reward)`, `rewardLedgerMeta(reward)`,
  idempotent via `CoinRewardClaim @@unique([userId, rewardKey])`.
- Config: `src/lib/appConfig.ts` — `getConfig<T>(key)`, `setConfig(key, value)`.
  Knobs: `src/lib/knobs.ts` + `src/modules/admin/knobs.ts` (`KNOB_REGISTRY`,
  `resolveKnobs`).
- World presence sidecar (the template for our gateway worker):
  `services/world-ws/server.js` — standalone Node service, Node 22, HMAC
  contract with the app, its own Railway service + healthcheck.

---

## §1 — Architecture

**Hybrid, two processes, one shared core.**

```
Discord ──HTTP POST──▶ Next.js /api/discord/interactions   (commands, buttons,
                        (existing, unchanged)                modals, context menus)

Discord ◀──gateway────  services/discord-gateway  ──HMAC POST──▶ Next.js
  (bot dials out,       (NEW thin "ear": hears        /api/discord/gateway
   listens for          @mentions, forwards them)     (runs Concierge, posts
   @mentions)                                           the reply via discordApi)

         both lean on ▼
   DB (Prisma) · withOutbox · coin ledger · AI intent · card builder
```

- The HTTP interactions endpoint stays exactly as-is and keeps handling all
  commands/buttons/modals/context-menus. Setting an Interactions Endpoint URL
  only reroutes *interactions* off the gateway; a separate gateway connection
  for message events is fine and normal.
- The gateway sidecar is a **listener only**. It never posts to Discord — it
  forwards the mention to the app, and the app posts the reply (so all posting
  logic, auth, and the card builder live in one place).
- Single replica for the sidecar (exactly one gateway connection).

### New env vars (add to `.env.example` + Railway)

| Var | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | app + (already used by world scripts) | AI Concierge / `/ask`. Reuse the existing key. |
| `OPENROUTER_MODEL` | app | Concierge text model. Default `anthropic/claude-haiku-4-5` (cheap, fast). |
| `DISCORD_GUILD_ID` | app + sidecar | The server id. Used for **guild** command registration (instant vs ~1h global) and Scheduled Events. |
| `DISCORD_GATEWAY_SECRET` | app + sidecar | HMAC shared secret for the sidecar→app forward call. |
| `APP_FORWARD_URL` | sidecar | `=$AUTH_URL/api/discord/gateway`. Where the sidecar POSTs mentions. |

Existing `DISCORD_APP_ID/PUBLIC_KEY/BOT_TOKEN/CHANNEL_ID` are reused as-is.
**Discord dev portal:** enable the **Message Content** privileged intent (self-
enabled under 10k users) for the sidecar; keep the Interactions Endpoint URL set.

---

## §2 — Data model (additive)

Add these to `prisma/schema.prisma` and one migration. All use bare `userId`.

```prisma
// Live-editable posted messages (poll cards, leaderboards, drops, games).
model DiscordMessageRef {
  id        String   @id @default(cuid())
  kind      String   // "poll" | "listing" | "leaderboard" | "drop" | "coinflip" | "digest"
  refId     String   // the entity id this message mirrors
  channelId String
  messageId String
  createdAt DateTime @default(now())
  @@unique([kind, refId])
  @@index([messageId])
}

// Per-user DM notification opt-ins + cached DM channel.
model DiscordNotifyPref {
  userId      String   @id
  dmTurn      Boolean  @default(true)   // your turn (Tanks/20Q/Poker)
  dmClaims    Boolean  @default(true)   // outbid / claimed
  dmStakes    Boolean  @default(true)   // stake resolving soon
  dmMentions  Boolean  @default(true)   // comment reply / @mention
  dmDigest    Boolean  @default(false)  // periodic digest
  digestDaily Boolean  @default(false)  // true=daily, false=weekly
  dmChannelId String?                   // cached DM channel id
  updatedAt   DateTime @updatedAt
}

// AI Concierge: a pending draft awaiting the user's "Post it".
model DiscordDraft {
  id        String    @id @default(cuid())
  userId    String
  kind      String    // "poll" | "idea" | "event" | "recipe" | "wishlist" | "countdown" | "listing" | "stake"
  data      Json      // validated draft fields for that kind
  channelId String
  createdAt DateTime  @default(now())
  expiresAt DateTime
  postedAt  DateTime?
  @@index([userId, createdAt])         // also used for the per-user daily AI cap
}

// In-chat coin drop: first-come or split among N claimers.
model DiscordDrop {
  id        String   @id @default(cuid())
  channelId String
  messageId String?
  amount    Int
  kind      String   @default("first") // "first" | "split"
  maxClaims Int      @default(1)
  expiresAt DateTime
  createdAt DateTime @default(now())
  claims    DiscordDropClaim[]
}
model DiscordDropClaim {
  dropId String
  userId String
  at     DateTime @default(now())
  drop   DiscordDrop @relation(fields: [dropId], references: [id], onDelete: Cascade)
  @@id([dropId, userId])
}

// Coinflip duel (zero-sum, winner takes both antes).
model DiscordCoinflip {
  id           String   @id @default(cuid())
  channelId    String
  messageId    String?
  challengerId String
  opponentId   String?              // null = open challenge
  ante         Int
  status       String   @default("open") // open | settled | cancelled | expired
  winnerId     String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}
```

Migration SQL: straight `CREATE TABLE` + the unique/index/foreign-key from the
models above. (Generate with `prisma migrate dev`, then verify the SQL is pure
`CREATE` — no drops.)

### Union / config additions

- `src/lib/outbox.ts` `OutboxEventType` — add: `"discord.tip.sent"`,
  `"discord.drop.created"`, `"discord.drop.claimed"`,
  `"discord.coinflip.created"`, `"discord.coinflip.settled"`. (Optional feed
  cards / future rules; none get a coin rule — see §3h.)
- `src/lib/appConfig.ts` `AppConfigKey` — add `"discord.settings"` (feature
  toggles: `{ tipsEnabled, dropsEnabled, aiEnabled, digestDay, digestHour, aiModel }`).
- `src/modules/admin/knobs.ts` `KNOB_REGISTRY` — add a `"discord"` group with
  numeric knobs: `tipDailyCap` (default 5000), `tipMinAmount` (10),
  `coinflipMaxAnte` (1000), `dropDefaultAmount` (250), `dropWindowSec` (60),
  `aiDailyLimit` (20). Read with `getGameKnobsCached("discord")`.

---

## §3 — The backbone (Wave 0 — build first)

Eight small modules. Most live under `src/lib/discord/`. Build these before any
feature wave; Wave 0 also ships a visible payoff (the card glow-up).

### 3a — Feature registry — `src/lib/discord/registry.ts`

A registry mirroring `src/modules/registry.ts` so each feature self-registers its
commands, context-menus, component handlers, and feed cards. This is the
extension seam (and the future World seam).

```ts
export type DiscordFeature = {
  key: string;
  // application command definitions contributed to register-discord-commands.ts
  commands?: CommandDef[];
  // map of command name -> handler(user, interaction)
  commandHandlers?: Record<string, Handler>;
  // map of custom_id head -> handler(user, rest[], values?)
  componentHandlers?: Record<string, ComponentHandler>;
  // outbox type -> CardSpec/components (extends feed.ts)
  feed?: Partial<Record<OutboxEventType, FeedContribution>>;
};
export function registerFeature(f: DiscordFeature): void;
export function allFeatures(): DiscordFeature[];
```

Refactor `interactions.ts` dispatch and `feed.ts` `specFor/componentsFor` to
consult the registry (keep the existing switch behavior by registering the
current commands/cards as the first feature, "core"). Don't change current
behavior — just route it through the registry so new features are additive.

### 3b — Components V2 builder — `src/lib/discord/components.ts`

```ts
export const IS_COMPONENTS_V2 = 1 << 15; // 32768
export const container = (opts: { accentColor?: number; components: object[] }) => ({...}); // type 17
export const textDisplay = (markdown: string) => ({ type: 10, content: markdown });
export const section = (opts: { text: string[]; accessory: object }) => ({...}); // type 9
export const mediaGallery = (items: { url: string }[]) => ({...}); // type 12
export const separator = (divider = true) => ({ type: 14, divider });
export const actionRow = (...c: object[]) => ({ type: 1, components: c });
export const button = (style: number, label: string, custom_id: string, opts?) => ({...});
export const linkButton = (label: string, url: string) => ({ type: 2, style: 5, label, url });

// Post / edit a V2 message via the bot token.
export async function postV2(channelId: string, components: object[], files?: {name:string; data:Buffer}[]): Promise<{messageId:string}>;
export async function editV2(channelId: string, messageId: string, components: object[]): Promise<void>;
```

`postV2`/`editV2` use `discordApi()` with `flags: IS_COMPONENTS_V2`. **Gotchas
to honor:** the flag disables `content`/`embeds`/`poll`; attachments only render
if referenced by a `mediaGallery`/file component; ≤40 components, ≤4000 chars of
text total; the flag is irreversible per message.

**Card glow-up:** add `postCardV2(spec, png, components, kind?, refId?)` that
keeps the brutalist PNG (still `renderCardPng` from `card.tsx`) inside a
`mediaGallery`, wrapped in a `container` (accent = module color) with a
`textDisplay` kicker/headline and the interactive `components`. Switch
`drainer.ts`'s `postRow` to call this. When `kind`/`refId` are passed, capture
the returned `messageId` and upsert a `DiscordMessageRef` (so the card can
live-edit later — e.g. RSVP counts, CLAIMED state, poll tallies). Keep the
legacy `postCardToDiscord` (embed+PNG) as the webhook-mode fallback.

### 3c — Message-state / live-edit — `src/lib/discord/messageState.ts`

```ts
export async function rememberMessage(kind: string, refId: string, channelId: string, messageId: string): Promise<void>;
export async function editTrackedMessage(kind: string, refId: string, components: object[]): Promise<void>; // looks up ref, editV2
```

Used to update a card after the underlying entity changes (RSVP, claim, vote
tally, drop claimed, coinflip settled). No-op if no ref exists.

### 3d — DM delivery — `src/lib/discord/dm.ts`

```ts
// Opens (and caches in DiscordNotifyPref.dmChannelId) a DM channel, sends V2 components.
export async function dmUser(userId: string, components: object[]): Promise<"sent" | "blocked" | "skip">;
```

`POST /users/@me/channels {recipient_id}` → send. **Handle error code 50007**
("cannot send to this user" = DMs closed) → return `"blocked"`, don't throw,
don't retry in a loop. Respect the relevant `DiscordNotifyPref` flag before
sending. Resolve `userId → discordUserId` via `User`.

### 3e — Scheduler — `src/lib/discord/scheduler.ts`

In-process time-of-day jobs (same philosophy as the drainer's `setInterval`,
started from `instrumentation.ts`). A 60s tick that fires due jobs:

- **Digest** (daily or weekly per `DiscordNotifyPref`) at
  `discord.settings.digestHour`.
- **Stake-resolving-soon** and **your-turn** sweeps (find rows due, DM opted-in
  users; dedupe with an in-memory "already sent today" set keyed by entity+user).

Guard each job so it runs once per window (store last-run in `AppConfig` or an
in-memory date check; a restart re-checking is fine at this scale).

### 3f — Prefs + global settings (admin) — `src/app/api/me/discord/prefs` + admin

- User-facing: extend the `/me` Discord card (`DiscordLinkCard.tsx`) with DM
  opt-in toggles → `GET/PUT /api/me/discord/prefs` writing `DiscordNotifyPref`.
  Also exposable via a `/notify` slash command (ephemeral toggle buttons).
- Admin-facing: extend `src/modules/admin/DiscordPanel.tsx` (and `schema.ts`)
  with the `discord.settings` toggles (tips on/off, drops on/off, AI on/off,
  digest day/hour) and surface the new `"discord"` knob group in the existing
  Economy/knobs UI. Reuse `getConfig`/`setConfig` and the knobs admin plumbing.

### 3g — AI intent service — `src/lib/ai.ts` + `src/lib/discord/concierge.ts`

`src/lib/ai.ts` (new runtime helper; the existing OpenRouter use is build-time
scripts only):

```ts
// OpenRouter chat completion in JSON mode. Reuses OPENROUTER_API_KEY.
export async function chatJSON<T>(opts: {
  system: string; user: string; schema: ZodType<T>; model?: string; maxTokens?: number;
}): Promise<T>;   // POST https://openrouter.ai/api/v1/chat/completions, response_format json, validate with zod, retry once on parse/validation fail
```

`concierge.ts` — the brain shared by every front door:

```ts
type Draftable = "poll"|"idea"|"event"|"recipe"|"wishlist"|"countdown"|"listing"|"stake";

// Create-side: free text (+ optional pointed-at message) -> validated draft.
export async function draftFromText(input: {
  userId: string; text: string; sourceMessage?: string;
}): Promise<{ kind: Draftable; data: unknown; summary: string } | { error: string }>;

// Answer-side: question -> answer grounded in this group's own data.
export async function answerQuestion(input: { userId: string; question: string }): Promise<string>;
```

- `draftFromText` system prompt enumerates the `Draftable` kinds and each kind's
  fields; the model returns `{kind, data}`; **validate `data` against that
  kind's zod schema** (reuse the module's existing zod schema where possible,
  e.g. the poll/idea/event create schemas) before returning. The
  `sourceMessage` (the pointed-at "^" message) is passed **as data**, never as
  instructions (prompt-injection safety; the human confirm step is the gate).
- `answerQuestion` does a small retrieval step first (assemble compact context:
  upcoming `Event`s + RSVPs, `arcadeScore` leaderboards, the user's `coins` +
  recent ledger, active `nowPlayingItem`s, open `Idea`s/`Poll`s, upcoming
  birthdays) then asks the model to answer in the app's voice (see the copy
  voice: ironic/over-the-top, never twee). Web/no-web link in the answer.
- **Rate limit:** before drafting/answering, count this user's `DiscordDraft`
  rows today (or a small counter) vs `discord` knob `aiDailyLimit`; over → a
  friendly ephemeral "you've hit today's AI limit."
- **Cost:** default to a cheap model (`OPENROUTER_MODEL`), short max tokens,
  only on explicit trigger. Respect `discord.settings.aiEnabled`.

### 3h — Economy adapter — `src/lib/discord/economy.ts`

Thin wrappers over `bank.ts` for Discord-initiated money moves. **Reuse
`spendCoins`/`creditWinnings`/`validateBet`/`logRound` — do not reimplement coin
math.**

```ts
// Net-zero transfer (NOT a mint). Debits `from`, credits `to`, one withOutbox tx.
export async function tip(fromUserId: string, toUserId: string, amount: number): Promise<void>;
//   - guard: amount >= knob tipMinAmount, <= remaining daily cap (sum today's
//     "discord.tip" debits vs tipDailyCap), from != to, discord.settings.tipsEnabled
//   - inside withOutbox: spendCoins(tx, from, amount, "discord.tip", "Tipped a friend")
//                        creditWinnings(tx, to, amount, "discord.tip", "Got tipped")
//     emit { type:"discord.tip.sent", payload:{from,to,amount} }  // no coin rule (manual)

// Daily claim — REUSE the existing promo system so web + Discord can't double-claim.
export async function claimDaily(userId: string): Promise<{ claimed: boolean; amount: number }>;
//   const reward = (await effectiveRewards()).find(r => r.cadence === "daily");
//   const rewardKey = claimKeyFor(reward);            // includes today's date
//   try in a tx: coinRewardClaim.create({userId, rewardKey})  // unique => idempotent
//                user.coins increment; coinTransaction.create(reason:"coin.reward", meta: rewardLedgerMeta(reward))
//   catch unique-violation => { claimed:false }       // already claimed today (on either surface)
//   (Prefer: extract the web claim route's body into this shared fn and have both call it.)
```

Micro-games (Wave 3) also use `bank.ts`: coinflip antes via `spendCoins`
(reason `"discord.coinflip"`), settle via `creditWinnings(winner, 2*ante)`
(zero-sum, no house edge); slot/dice via `validateBet`→`debitStake`→
`creditWinnings`→`logRound(game:"discord-slots")` honoring `arcade` knobs.

---

## §4 — The gateway sidecar — `services/discord-gateway/`

Model **file-for-file** on `services/world-ws/` (standalone Node 22 service, own
`package.json`, own Railway service, tiny HTTP healthcheck). It is a listener
that forwards; it holds **no app logic**.

`services/discord-gateway/package.json`
```json
{ "name": "discord-gateway", "private": true, "type": "module", "main": "server.js",
  "scripts": { "start": "node server.js" }, "engines": { "node": ">=22" },
  "dependencies": { "discord.js": "^14.16.0" } }
```

`services/discord-gateway/server.js` — behavior:
1. Tiny `http.createServer` returning `discord-gateway ok` (Railway healthcheck),
   like world-ws.
2. `new Client({ intents: [Guilds, GuildMessages, MessageContent] })`,
   `client.login(DISCORD_BOT_TOKEN)`.
3. On `messageCreate`: ignore bot authors; require the message mentions the bot
   (`message.mentions.has(client.user)`). Build the payload:
   - `discordUserId = message.author.id`, `channelId`, `messageId`,
     `guildId`, `text` = content with the bot mention stripped.
   - `referenced` = if `message.reference`, `await message.fetchReference()` →
     `{ authorId, content }` (this is the "^" target; needs Message Content
     intent). Else null.
4. POST to `APP_FORWARD_URL` with header
   `x-udm-signature: hmacSHA256(rawBody, DISCORD_GATEWAY_SECRET)` (mirror
   world-ws's HMAC). Fire-and-forget; log failures. **Do not reply to Discord.**
5. Library handles heartbeat/reconnect/resume. Run **one replica**.

App side: `src/app/api/discord/gateway/route.ts`
- Read raw body, verify the HMAC (reject 401 on mismatch; mirror the
  interactions route's raw-body discipline).
- Resolve `db.user.findUnique({ where: { discordUserId } })`. If unlinked → post
  an ephemeral-style nudge is impossible without an interaction, so post a brief
  channel reply via `discordApi` ("@user — link your UDM+ first: run `/link`")
  and return.
- If `discord.settings.aiEnabled` and under the AI cap → trigger a typing
  indicator (`POST /channels/{id}/typing`), run `draftFromText({ userId, text,
  sourceMessage: referenced?.content })`, then **post the draft card to the
  channel** via `postV2` with `concierge:post:<draftId>` / `concierge:edit:<draftId>`
  buttons (store a `DiscordDraft`). Return 200 fast.
- Everything after (Edit modal, Post it) flows through the **existing** HTTP
  interactions endpoint — no new transport.

Railway: create a new service `discord-gateway` pointed at
`services/discord-gateway` (root dir + `npm start`), env: `DISCORD_BOT_TOKEN`,
`DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `DISCORD_GATEWAY_SECRET`,
`APP_FORWARD_URL`. Replicas = 1.

---

## §5 — Feature waves

Each wave: scope · key files · acceptance. Build top-to-bottom.

### Wave 0 — Backbone & glow-up  `[dazzle][funnel]`
- Build §3a–§3f. Switch the drainer to `postCardV2` (brutalist PNG inside a V2
  container with live buttons) and store `DiscordMessageRef` for poll/listing/
  event cards. Wire RSVP/claim/vote handlers to `editTrackedMessage` so the
  channel card updates in place (counts, CLAIMED).
- Quick win: `/poll quick` posts a **native** Discord poll (`poll` object on
  Create Message: ≤10 answers ≤55 chars, duration, `allow_multiselect`) for
  fast public votes; keep the existing custom button-poll for anonymous/scale.
- **Acceptance:** existing 13 feed cards render as V2 with working buttons that
  visibly update the same message; native `/poll quick` works; typecheck green.

### Wave 1 — AI Concierge (HTTP front doors)  `[do-more][dazzle]`
- Build §3g. Add front doors:
  - **Message context menu** `Make this into…` (application command **type 3**).
    The interaction payload includes the target message in
    `data.resolved.messages` (content available **without** the Message Content
    intent / gateway). Run `draftFromText`, reply **ephemerally** with the draft
    card (Edit / Post it).
  - **Slash** `/udm <text>` — same engine, ephemeral draft card.
  - **Slash** `/ask <question>` — `answerQuestion`, ephemeral reply (deferred
    ack, single follow-up — no streaming; respect the ~5 edits/5s limit).
- Component handlers: `concierge:post:<draftId>` → load draft, run the real
  create via the module's logic inside `withOutbox` (so the normal card +
  coins fire), mark `postedAt`; `concierge:edit:<draftId>` → open a modal
  prefilled from `data`, update the draft.
- **Acceptance:** right-click a message → poll/idea/event draft appears, Post it
  creates the real entity (normal feed card + coins), Edit works; `/udm` and
  `/ask` work; AI daily cap enforced.

### Wave 2 — Conversational `@mention` (the headline)  `[dazzle][do-more]`
- Build §4 (sidecar + `/api/discord/gateway`). The mention path reuses the Wave
  1 Concierge engine; the only new code is the listener + forward endpoint.
- Draft cards posted from a mention are **in-channel** (tag the user) rather
  than ephemeral; Post/Edit reuse the same component handlers.
- **Acceptance:** `@UDM+ make a poll about this ^` (as a reply, or pointing at
  the message above) posts a draft card in-channel; Post it ships the real poll.
  Sidecar survives a reconnect; single replica; unlinked users get a nudge.

### Wave 3 — Full economy  `[do-more][dazzle]`
- `/wallet` (V2 card: balance, claimable daily, recent ledger, arcade rank),
  `/daily` (→ `claimDaily`, streak shown if derivable from `CoinRewardClaim`).
- `/tip @user <amount>` (→ `economy.tip`, guardrails per §3h; ephemeral confirm
  + optional small public "X tipped Y" card if `discord.tip.sent` is added to
  the feed).
- **Coin drops:** `/drop <amount> [split|first]` posts a V2 card with a Claim
  button (`drop:claim:<id>`); first-or-split logic against `DiscordDrop` /
  `DiscordDropClaim` (atomic, idempotent per user), credit via `creditWinnings`,
  `editTrackedMessage` to show claimed/closed; auto-close at `expiresAt`
  (scheduler) or when `maxClaims` hit.
- **Coinflip duel:** `/coinflip @user <ante>` (or open challenge) → accept button
  → both antes debited → `uniform()` decides → winner credited 2×ante → settle +
  edit card. Zero-sum.
- *Optional stretch:* slot pull / crash-lite / mines-lite buttons reusing
  `bank.ts` rolls (state in a small row or the message). Mark clearly optional.
- **Acceptance:** claim once/day across web+Discord (no double-claim); tip moves
  coins net-zero within caps; a drop pays the right people once; coinflip settles
  correctly and can't be double-claimed.

### Wave 4 — Notify, presence & delights  `[funnel][dazzle]`
- DM alerts (§3d + scheduler §3e): your-turn, outbid/claimed, stake-resolving,
  reply/mention, treasure rollover — each gated by `DiscordNotifyPref`.
- Digest (daily/weekly) V2 card via DM: pet mood (`@/modules/pet/engine`
  `getPetView`), leaderboard movers, upcoming events/birthdays/countdowns, open
  polls, "you have X claimable."
- Pet as a channel citizen: post when mood shifts; pattable button in-channel.
- Bot presence flavor (set via the sidecar's gateway connection:
  `client.user.setPresence` — "Watching 3 open polls", "Counting down to …") +
  per-server bot profile (banner/avatar/bio).
- **Linked Roles:** register ≤5 role-connection metadata fields (coin tier, pet
  stage, stakes-accuracy "oracle", linked=true), OAuth2 `role_connections.write`,
  push values on relevant outbox events. (New small route + a metadata register
  script.)
- **Native Scheduled Events:** on `event.created`/updated, create/update a
  Discord Scheduled Event (`/guilds/{DISCORD_GUILD_ID}/scheduled-events`) so it
  shows in Discord's event UI with reminders; store the id on the `Event` (or a
  `DiscordMessageRef` with kind "scheduled-event").
- **App emoji + Wrapped:** register branded app emoji (coin/pet/module icons);
  periodic "UDM+ Wrapped" personal stat card via DM.
- **Acceptance:** each DM type respects its toggle and the 50007 fallback;
  digest renders; at least coin-tier Linked Role updates; an app Event appears
  as a Discord Scheduled Event.

---

## §6 — Command registration

Extend `scripts/register-discord-commands.ts` `COMMANDS` with the new slash
commands and the context menu. Set installation contexts so commands also work
in DMs where useful.

New entries (add to the array):
- `{ name:"udm", description:"Ask UDM+ to make something from a description", type:1, options:[{name:"text",description:"What to make",type:3,required:true,max_length:400}] }`
- `{ name:"ask", description:"Ask the group AI about your data", type:1, options:[{name:"question",type:3,required:true,max_length:300}] }`
- `{ name:"wallet", description:"Your coins, daily claim, and rank", type:1 }`
- `{ name:"daily", description:"Claim your daily coins", type:1 }`
- `{ name:"tip", description:"Tip a friend some coins", type:1, options:[{name:"user",type:6,required:true},{name:"amount",type:4,required:true,min_value:1}] }`  // type 4 = integer
- `{ name:"drop", description:"Drop coins for the channel to claim", type:1, options:[{name:"amount",type:4,required:true,min_value:1},{name:"mode",type:3,required:false}] }`
- `{ name:"coinflip", description:"Challenge a friend to a coinflip", type:1, options:[{name:"ante",type:4,required:true,min_value:1},{name:"user",type:6,required:false}] }`
- `{ name:"poll", description:"Quick native poll", type:1, options:[{name:"question",type:3,required:true},{name:"options",type:3,required:true,description:"comma-separated"}] }`
- `{ name:"notify", description:"Choose which DM alerts you get", type:1 }`
- **Context menu:** `{ name:"Make this into…", type:3 }`  // message context menu

Also add, where commands should work outside the main channel/DMs, the
top-level `"integration_types":[0,1]` and `"contexts":[0,1,2]` (guild + user
install; guild / bot-DM / private channel). For fast iteration register to the
**guild** (`/applications/{appId}/guilds/{DISCORD_GUILD_ID}/commands`) — instant
vs ~1h for global. Keep the bulk-PUT shape; note Entry Point (type 4) is only
for Activities and is out of scope.

---

## §7 — Guardrails (must implement, not optional)

| Risk | Mitigation |
|---|---|
| **Tipping makes coins transferable** (today they're non-transferable; Venmo = real money) | Behind `discord.settings.tipsEnabled` (default off until owner flips it); `tipDailyCap` + `tipMinAmount` knobs; `from != to`; net-zero (no mint). |
| **AI misparse posts garbage publicly** | Confirm-before-post is the default (draft → Edit/Post). Low-risk kinds may offer one-tap post. |
| **Prompt injection via the pointed-at message** | Pass `sourceMessage` as data, never as instructions; validate model output against the module's zod schema; human confirm gate. |
| **AI cost/abuse** | `discord.settings.aiEnabled`, cheap `OPENROUTER_MODEL`, short max tokens, per-user `aiDailyLimit`. |
| **DM spam / closed DMs** | Per-category `DiscordNotifyPref`; handle error **50007** as `"blocked"`; never loop; cache DM channel id. |
| **Double-spend / double-claim on a click** | Re-validate entity in DB; guarded `spendCoins` (`coins >= amount`); idempotent unique constraints (`CoinRewardClaim`, `DiscordDropClaim`, coinflip status check). |
| **Components V2 footguns** | Flag is irreversible; no `content`/`embeds` on V2 messages; attachments must be referenced via media component; ≤40 components / ≤4000 chars. |
| **Privacy of Message Content intent** | The bot can now see channel messages — acceptable for a private server; document it. Only act on explicit @mentions. |
| **Sidecar duplicate events** | Exactly one replica. |

Consciously **skipping**: voice/DAVE, monetization (gated + irrelevant), sharding.

---

## §8 — World seam (deferred, leave clean)

No World work in this build. The registry (§3a), identity
(`discordUserId ↔ WorldAvatar`), card builder, DM service, and presence hook are
exactly the seam: a future `services`-side or feature-side `world` module can
`registerFeature({ key:"world", commands:[...], feed:{...} })` to add `/world`
commands, "who's in the World" presence, and rare-furniture/house cards — and
later a Phaser **Activity** in voice — without touching anything built here.
Don't add World code; just don't foreclose it.

---

## §9 — Build-order checklist

1. **DB:** add §2 models + one additive migration; extend the `OutboxEventType`,
   `AppConfigKey`, and `KNOB_REGISTRY` lines; `prisma migrate dev && generate`.
2. **Backbone §3:** registry → components(V2) → messageState → dm → scheduler →
   prefs/admin → ai/concierge → economy. Typecheck after each.
3. **Wave 0:** drainer → `postCardV2`; live-edit on RSVP/claim/vote; `/poll quick`.
4. **Wave 1:** `/udm`, `/ask`, `Make this into…` context menu + `concierge:*`
   handlers + Edit modal; register commands (guild).
5. **Wave 2:** `services/discord-gateway` + `/api/discord/gateway`; new Railway
   service (1 replica); enable Message Content intent in the dev portal.
6. **Wave 3:** `/wallet`, `/daily`, `/tip`, `/drop`, `/coinflip` (+ optional
   slot/crash-lite).
7. **Wave 4:** DM alerts + digest + pet citizen + presence + Linked Roles +
   Scheduled Events + app emoji + Wrapped.
8. After each wave: `npm run typecheck`, confirm dev-server compiles, hand to the
   owner to test in Discord. Commit per wave, push to `main` (Railway
   auto-deploys; migrations run on boot). Run `npm run discord:register` whenever
   the command set changes.

---

## §10 — Acceptance summary (owner-tested in Discord)

- Feed cards are native-rich (V2) and update in place.
- Right-click a message or `@mention` the bot in plain English → a correct,
  editable draft → Post ships the real thing with the normal card + coins.
- `/ask` answers questions about the group's own data, in voice.
- Claim/tip/drop/coinflip move coins correctly, idempotently, within caps; daily
  claim is shared with the web app.
- Opt-in DMs and a digest arrive only for opted-in users and degrade gracefully
  when DMs are closed.
- App still builds/runs with no Discord env set; typecheck is green.
