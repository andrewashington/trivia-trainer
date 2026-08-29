# Type — design spec

A personalized typing trainer for UDM+. First job: make you faster, via a
placement test and a daily workout built from your weak keys. Second job:
a Monkeytype-quality typing surface, a sandbox, a group daily race, two
leaderboards, badges, and a small coin drip.

**Desktop / hardware keyboard only.** No mobile layout, no software-keyboard
accommodations, no “better on desktop” banner. This is a web module for a
real keyboard.

Status: **spec approved, not built.**

## Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Product | Trainer first, social second | Personalized journey is the point; daily / boards / awards hang off it |
| Engine | Per-key stats + biased word gen | Keybr pedagogy; Monkeytype is the surface, not the curriculum |
| Surface | One typer, many configs | Placement, workout, daily, sandbox, target-keys share one client |
| Placement | Required first run, retakeable | Qualifies you; later check-ins refresh the profile without wiping history |
| Practice | Daily workout + sandbox | Prescribed plan by default; Monkeytype-style free practice anytime |
| Corpus | Words, punct, numbers, quotes | Modes / toggles. Workout + placement default to letters so stats stay honest |
| Daily | Shared 60s seed, first finish official | Fair race. Retries train keys, they do not overwrite the board |
| Boards | Daily + all-time rated WPM | Two boards people will check. Streak lives on badges |
| Awards | Badges + small coins | Shareable wall + existing economy. Not a payout table |
| Device | Desktop / hardware keyboard | User call: do not design for phones |
| Layout | US QWERTY heatmap | One layout in MVP |
| Language | English only | One word list, one quote pack |
| Category | Arcade | Daily, boards, coins. Soul is closer to The Pump |
| Name / route | **Type** at `/type` | Short, obvious |

## Out of scope (MVP)

- Live multiplayer races
- Themes, custom carets, custom word-list upload
- Languages other than English; layouts other than US QWERTY
- Code mode, stop-on-error as a first-class mode
- Mobile / touch / software keyboard
- Persisting raw keystroke archives after scoring
- Using `arcade.played` on every run (farmable)

## The journey

### First visit

The hub is a placement gate. No workout, no sandbox, no daily, no boards
until the first placement is submitted.

Placement is a **rated** run: 60 seconds, common English words, letters and
space only, no targeting, no punctuation, no numbers. Same rules for
everyone.

Results screen: WPM, accuracy, keyboard heatmap, a short read of the
weakest keys that have enough samples. Then the hub unlocks.

### Hub (default after placement)

Surfaces, in this order:

1. **Today’s workout** — the default next action
2. **Target keys** — pick letters, run a drill now
3. **Sandbox** — time / words / quote, punctuation and numbers as toggles
4. **Daily race** — today’s shared passage
5. **Progress** — WPM over time, heatmap, streak
6. **Boards + awards** — daily board, all-time rated WPM, badge wall

### What updates the journey

Every **finished** run (placement, workout piece, official daily, daily
retry, sandbox, targeted) updates the per-key model. Abandoned runs do
not.

The next day’s workout is rebuilt from the current model. Retaking
placement is a check-in: it updates the profile and can mint a personal
best; it does not wipe session history or regenerate a workout already
started today.

## Session kinds

| Kind | How you start it | Counts for all-time? | Feeds per-key model? |
|---|---|---|---|
| `placement` | First visit, or “re-test” on the hub | Yes (it is rated) | Yes |
| `workout` | A piece of today’s plan | No | Yes |
| `daily` | Today’s shared passage | No (has its own board) | Yes |
| `sandbox` | Free config | Only if settings are rated | Yes |
| `targeted` | Key picker | No | Yes |

**Rated** (all-time board + placement rules): mode `time`, 60 seconds,
English words, punctuation off, numbers off, no target keys. Sandbox
shows a “counts for PB” chip when those settings are on. That is the
only way a sandbox run hits the all-time board. 15s farming does not.

## The engine

### Per-key model

One row per user per grapheme. Workout targeting only considers `a`–`z`.
Punctuation and digits still update their own rows when those toggles
are on; they never drive the workout picker.

Fields:

- `hits` — correct presses
- `misses` — wrong presses (including extra letters)
- `latencyEmaMs` — EMA of inter-key time on **correct** hits only
  (alpha `0.2`)
- `wasWeakAt` — set the first time this key meets the weak rule; never
  cleared. Lets us award “cleared” without a history table.
- `updatedAt`

Space is not stored. Only non-space graphemes.

A key is **learning** until `hits + misses >= 8`. Learning keys are not
called weak.

Weakness (only for keys that qualify):

```
errorRate    = misses / (hits + misses)
slowFactor   = latencyEmaMs / userMedianLatencyMs
weakness     = errorRate * 0.65 + max(0, slowFactor - 1) * 0.35
```

`userMedianLatencyMs` is the median EMA across that user’s `a`–`z` keys
that have enough samples. Weakness is relative to you, not the group.

The workout’s target set is the **3 highest-weakness** qualifying keys.
If fewer than 3 qualify (fresh profile), fill from the least-sampled
`a`–`z` keys so the drill still has something to teach.

**Weak (sets `wasWeakAt` once):** `weakness >= 0.25` and `samples >= 20`.

**Cleared:** `wasWeakAt` is set and current `weakness < 0.15` with
`samples >= 30`. Used for the per-key badge. Awarded once per key.

### Word generation

Static top ~2,000 English words in the module. No network.

When targeting keys:

- 60% of words contain at least one target, weighted toward the weakest
- 40% are ordinary common words (rhythm stays like English)
- Never emit single-letter spam or `qbq qqb` strings as the whole drill

When not targeting: sample the common list (with a seed when we need
reproducible text).

Punctuation / numbers: after a word is chosen, optionally decorate it
with a small fixed set (`, . ? ! '` and `0–9`) so the typer has
something to hit. Decoration is deterministic from the seed.

Quotes: a static pack of **original + public-domain** lines only. No
scraped or copyrighted quotes. Tags by character count (excluding
spaces does not matter — count the string as stored): `short` is
under 80 characters, `medium` is 80–180. Nothing longer goes in the
pack.

### Today’s workout

Generated **once** per user per UTC date. Stored. Refreshing the page
does not rebuild it. A placement retake does not rewrite a plan already
created today.

Default pieces (skip a quote piece if the pack is empty, still require
the rest):

1. **Warmup** — 30s, common words, no targeting
2. **Weak-key drill** — 30s, the 3 target keys
3. **Mixed** — 45s, lighter bias (same targets, ~30% targeted words)
4. **Quote** — one `short` quote from the pack, seeded by date

Each piece stores `{ id, kind, config, seed, sessionId? }`. The seed
makes the word stream stable if they leave and come back. Completing a
piece writes `sessionId`. Completing the last required piece marks the
workout done, bumps streak, emits the outbox event.

Streak: consecutive UTC days with a completed workout. Broken by a
missed UTC day. Stored on the profile.

### Daily race

One shared passage per UTC date, generated on the server, stored.

- Default: a seeded 60s word list (letters only, ~200 words so nobody
  runs out)
- Every 7th UTC day (`floor(utcMidnightMs / 86400000) % 7 === 0`): a
  `medium` quote from the pack, indexed by that same day number,
  instead of generated words
- Same text, same order, everyone

**Official result:** the first finished `daily` submit for that user and
date. Unique `(userId, date)`. Later finishes are practice: they update
per-key stats and are stored as sessions with `official: false`; they
do not change the daily board.

## The typing surface

One client component. Config in, result + keystroke log out.

Monkeytype-quality, not Monkeytype-complete:

- Hidden input is the only keyboard sink while focused
- Click the words (or the overlay) to focus
- Unfocused: obvious overlay, “click to type”
- Flowing wrapped word stream; current word marked
- Smooth caret (CSS transition on position)
- Live paint: correct, incorrect, extra letters
- Backspace allowed in the current word; cannot edit prior words
- Space commits the current word and advances
- Quiet live WPM + accuracy
- **Tab** (while focused) restarts the same config; does not submit a
  score
- Leaving the run discards it — no partials on boards or in the model

**Sandbox config:**

- Mode: time `15 | 30 | 60 | 120`, words `10 | 25 | 50 | 100`, quote
  `short | medium`
- Toggles: punctuation, numbers
- Target-key picker can sit on any of the above (`kind: targeted` when
  any keys are selected)

The focused run lives at `/type/run` so the typer can take the page.
The UDM+ shell stays (this is still the app); the page itself is a
clean back-link + the surface + a tiny config readout. No extra cards
while a run is live.

Results stay on `/type/run` until you dismiss them (next / back to
hub). Workout “next piece” is one click from that results state.

## Scoring

One formula, client preview + server authority for rated and official
daily:

- **WPM** = `(correctChars / 5) / minutes`
- **Raw** = `(allTypedChars / 5) / minutes`
- **Accuracy** = `correctChars / (correctChars + incorrectChars)`

`correctChars` counts characters that match the prompt. Incorrect and
extra letters count as incorrect. Unfinished words at timer end count
only the characters already typed.

### Submit + trust

`POST /api/type/sessions` body includes the config, the prompt (word
list or quote id), and a compact log:

```ts
{ t: number; expect: string; got: string }[]
```

The log is **one record per prompt character, in order** — the final
alignment after backspaces, not every raw keydown. `t` is milliseconds
from run start of the keystroke that last set that slot. Latency EMA
uses `t[i] - t[i-1]` only when `got === expect`. Server recomputes
WPM / accuracy from prompt + log. Reject if:

- elapsed time does not match the mode (time runs: must be within ±2s
  of the configured duration; word/quote runs: must have completed the
  prompt)
- computed WPM > 250
- log is empty, or `got` / `expect` lengths are nonsense
- daily prompt does not match the stored passage for that date
- rated flag is claimed but config is not rated

Practice submits (workout, targeted, non-rated sandbox, daily retries)
still send the log; same recompute; same 250 cap. We are invite-only,
not lax about a 400 WPM “PB.”

Do not persist the log after scoring. Keep the session summary and
apply per-key deltas.

## Social

### Leaderboards

**Daily:** official results for the current UTC date, ranked by WPM
then accuracy. Show the group, highlight you. Yesterday is one click
(query `?date=`), not a third board.

**All-time:** each member’s best **rated** WPM (max over placement +
rated sandbox). Ranked by that number, then accuracy of that run.

### Badges (catalog)

Awarded server-side on session / workout / daily submit. Once each.

| Key | When |
|---|---|
| `placed` | First placement submitted |
| `wpm_40` / `wpm_60` / `wpm_80` | Any rated run hits that WPM |
| `streak_7` | Workout streak reaches 7 |
| `daily_1` | Official daily is #1 for that date (at submit time) |
| `cleared_<letter>` | That `a`–`z` key meets the cleared rule |
| `runs_100` | 100 finished sessions |

Badge wall on the hub: earned badges are lit, the rest are ghosts.
Friends see each other’s earned badges on the wall (group wall, not a
separate profile product).

### Coins

New outbox types, rules in `src/lib/coins.ts`. Amounts are small and
**idempotent by construction** (same pattern as The Pump’s first-log-
of-day):

| Event | When it fires | Amount | Farm guard |
|---|---|---|---|
| `type.placed` | First placement only | 150 | One row / one event ever |
| `type.workout.completed` | Last piece of the day done | 50 | One per user per UTC date |
| `type.daily.finished` | Official daily submit | 50 | Unique `(userId, date)` |
| `type.pb` | New personal best rated WPM | 100 | Only when `bestStandardWpm` increases |
| `type.badge.earned` | Each new badge | 25 | Once per badge key |
| `arcade.highscore` | Group best rated WPM beaten | existing 500 | Existing rule; also write `ArcadeScore` (`game: "type"`, `score: round(wpm)`) |

Do **not** emit `arcade.played` per run.

Knobs are optional later; ship the fixed amounts above. If we add a
`type` knob group, it overrides these numbers — it does not change
when events fire.

### Feed

Those outbox events are the activity-feed story. Payloads include
`userId`, the relevant number (WPM, badge key, date), and a short
label.

## Data

Additive Prisma only. Hand-written SQL in a folder named with
`date +%Y%m%d%H%M%S`.

### `TypingProfile`

One per user.

- `userId` unique
- `placementCompletedAt`
- `lastPlacementWpm` / `lastPlacementAccuracy`
- `bestStandardWpm` / `bestStandardAccuracy` / `bestStandardSessionId`
- `workoutStreak` / `lastWorkoutDate` (UTC `YYYY-MM-DD`)
- `createdAt` / `updatedAt`

### `TypingSession`

Every finished run.

- `userId`, `kind`, `mode` (`time` \| `words` \| `quote`)
- `durationSec`, `wordCount` (the one that applies)
- `punctuation`, `numbers`
- `targetKeys` `String[]`
- `rated` Boolean
- `dailyDate` / `quoteId` / `workoutId` / `pieceId` (nullable)
- `official` Boolean (daily first finish)
- `seed`, `wpm`, `rawWpm`, `accuracy`
- `correctChars`, `incorrectChars`
- `createdAt`

Indexes: `[userId, createdAt]`, `[kind, rated, wpm]`, `[dailyDate, official, wpm]`.

### `TypingKeyStat`

`@@id([userId, grapheme])`. `grapheme` is a single non-space character
(letter, digit, or punct). `hits`, `misses`, `latencyEmaMs`,
`wasWeakAt`, `updatedAt`.

### `TypingWorkout`

`@@unique([userId, date])`. `date` is UTC `YYYY-MM-DD`. `pieces` JSON
as described above. `completedAt` nullable.

### `TypingDaily`

`date` unique. `kind` `words` \| `quote`. `words` JSON (string[]) or
`quoteId`. Created lazily the first time anyone asks for today.

### `TypingDailyResult`

`@@unique([userId, date])`. `sessionId`, `wpm`, `accuracy`. Inserted
only for the official finish.

### `TypingBadge`

`@@unique([userId, badgeKey])`. `earnedAt`.

User relations on `User` for each of the above. Cascade on delete.

## Module wiring

Standard UDM+ shape. Stay in this lane.

- `src/modules/type/` — engine (pure), schema (Zod), typer UI, hub UI,
  word list, quote pack
- `src/app/(app)/type/page.tsx` — hub + placement gate
- `src/app/(app)/type/run/page.tsx` — focused typer
- `src/app/api/type/me/route.ts`
- `src/app/api/type/sessions/route.ts`
- `src/app/api/type/daily/route.ts`
- `src/app/api/type/leaderboard/route.ts`
- `src/app/api/type/workout/route.ts`
- Registry: `key: "type"`, Arcade, `href: "/type"`, new accent
  `bg-accent-typewriter` (`#C45C26` in `tailwind.config.ts`), new pixel
  icon `keyboard`
- Outbox union + coin rules as above
- Additive comments: none (no thread on Type)

### API

All session-cookie auth via `requireUser()`. Mutations through `/api`.

- `GET /api/type/me` — profile, key stats, badges, recent sessions.
  If placed: also today’s workout (create-if-missing) and daily
  official status. If not placed: profile stub only, no workout row.
- `GET /api/type/daily?date=` — passage + official board for that date
  (default today)
- `GET /api/type/leaderboard?board=daily|alltime&date=`
- `GET /api/type/workout` — today’s plan; creates it if absent
- `POST /api/type/sessions` — finish a run (see Scoring)
- Placement is a session with `kind: "placement"`; the first one sets
  `placementCompletedAt`. Later ones are check-ins.

Zod schemas live in `src/modules/type/schema.ts`.

### Pure functions (keep them framework-free)

- `scoreRun(prompt, log, durationMs)`
- `weakness(stats, median)`
- `pickTargets(stats)`
- `generateWords({ list, seed, targets, n, punct, numbers })`
- `buildWorkout({ date, targets, quotePack })`
- `dailyPassage({ date, wordList, quotePack })`
- `isRated(config)`

These are the testable core. The gate remains `npm run typecheck`. Do
not stand up a new test runner for MVP unless a function is easier to
pin with a tiny node assert script already used elsewhere.

## Error handling

- Typer unfocused: overlay, no keystrokes counted
- Mid-run navigation / refresh: discard
- Submit network fail: keep the result on the client, retry the POST;
  do not double-apply per-key deltas (session create is the
  idempotency — client sends an `idempotencyKey` cuid generated at run
  start; `TypingSession.id` can be that cuid)
- Workout already exists: return it, never regenerate
- Daily passage: first reader creates it in a transaction
- Not yet placed: every Type API except `GET /api/type/me` and
  `POST /api/type/sessions` with `kind: "placement"` returns 403
  `placement_required`
- Impossible scores: 400, no write

## UI notes (brutalist, not a Monkeytype skin)

UDM+ retro-brutalist chrome around a calm typing well. Thick borders
and loud accents on the hub; the run page is quieter so the words are
the product. Heatmap is a QWERTY graphic, not a table. Workout pieces
are a short checklist. Boards are the same card language as Snake /
Trivia, not a new visual system.

Copy voice: dry, a little mean, like the rest of the cartridge. Intro
card something like: “Take the test. Then we make you type the letters
you suck at. Friends can watch.”

## Implementation order (for the later plan)

1. Module shell + registry + empty hub
2. Typer + scoring + word list (sandbox, no persistence)
3. Schema / migration / session submit / per-key model
4. Placement gate + profile + heatmap (heatmap is the key-stat rows)
5. Workout builder + target-key picker
6. Daily passage + official result + two boards
7. Badges, coins, outbox, feed + WPM history on the hub

Ship when 1–7 work. The heatmap is not a follow-up — it ships with
placement, because the results screen already needs it.
