# Arcade modules — feature inventory

Refactor-scoping reference for everything in the **Arcade** nav category
(`src/modules/registry.ts`, category `"arcade"`, icon `gamepad`, tagline
"Fun & games"). Six modules: Ideas, Polls, Reveal, Stakes, Pet, Snake.

Current as of 2026-06-10 (post forfeit-wheel removal and the arcade
reconciliation pass: Reveal's `oracle` type was cut — anonymous scale
polls cover it; `sealed` is presented as "Time Capsule"; poll
sealed-results is presented as "Blind voting"; Stakes' "Oracle
standings" renamed "Track record"; create forms open in a ModuleHeader
modal as type-first wizards. Module identities: Polls = decide
together · Reveal = answer blind, unmask together · Stakes = call it,
reality settles it).

---

## Ideas — `/ideas` (icon `lightbulb`, accent `bg-accent-lime`)

Suggestion box with upvotes and an admin-managed lifecycle.

| Feature | Notes | Key files |
|---|---|---|
| Pitch an idea | Title (≤200) + optional detail (≤2000) | `src/modules/ideas/AddIdeaForm.tsx`, `schema.ts` |
| Edit / delete | PATCH/DELETE on own ideas | `src/app/api/ideas/[id]/route.ts` |
| Upvoting | Toggle vote (`{voted: boolean}`) per member | `src/app/api/ideas/[id]/vote/route.ts`, `IdeaCard.tsx` |
| Status lifecycle | `open → planned → done`; status moves are **admin-only**, enforced in the route | `schema.ts` (`STATUS_META`), `[id]/route.ts` |

APIs: `GET/POST /api/ideas`, `GET/PATCH/DELETE /api/ideas/[id]`, `POST /api/ideas/[id]/vote`.
Outbox: `idea.*` events (pet diet label "ideas & votes").

## Polls — `/polls` (icon `chart-bar-big`, accent `bg-accent-indigo`)

Three poll types with optional anonymity and sealed results.

| Feature | Notes | Key files |
|---|---|---|
| Poll types | `single` (pick one), `multi` (pick any), `scale` (rate 1–5). Choice polls need 2–8 options; scale has none | `src/modules/polls/schema.ts` (`POLL_TYPE_META`) |
| Voting | `optionIds[]` for choice polls, `rating` 1–5 for scale | `/api/polls/[id]/vote` |
| Anonymous polls | `anonymous: boolean` per poll | `schema.ts`, `PollCard.tsx` |
| Sealed results | `revealThreshold` (2–50): results hidden until that many members vote to reveal; tracked in `PollRevealVote` | `/api/polls/[id]/reveal`, prisma `PollRevealVote` |
| Close a poll | `pollPatch` (`closed: boolean`) | `/api/polls/[id]` PATCH |
| Results computation | Tallying/percentages computed at read time | `src/modules/polls/results.ts` |

APIs: `GET/POST /api/polls`, `GET/PATCH /api/polls/[id]`, `POST .../vote`, `POST .../reveal`.
Home page surfaces the latest open poll. Outbox: `poll.*` ("poll energy").

## Reveal — `/reveal` (icon `eye`, accent `bg-ink`)

Blind submissions revealed all at once. Three prompt types
(`REVEAL_TYPE_META` in `src/modules/reveal/schema.ts`):

| Type | Mechanic | Inputs |
|---|---|---|
| `rank` "Blind Rank" | Everyone ranks 2–12 items privately; consensus order drops at once | `items[]`, submission `order[]` (item indexes, best first) |
| `sealed` "Time Capsule" | A note (≤10k chars) locked until `unlockAt` — even the author can't peek; optional early unseal once `unlockVotesNeeded` (2–50) members vote (tracked in `RevealUnlockVote`) | `sealedBody`, `unlockAt`, `/api/reveal/[id]/unlock` |

Other features: optional `deadline` (must be future), aggregation logic in
`src/modules/reveal/engine.ts`, cards in `PromptCard.tsx`, creation in
`AddPromptForm.tsx`.

APIs: `GET/POST /api/reveal`, `PATCH /api/reveal/[id]`, `POST .../submit`, `POST .../unlock`.
Outbox: `reveal.created/submitted/revealed/deleted` ("secrets").

## Stakes — `/stakes` (icon `target`, accent `bg-accent-forest`)

Friendly predictions and bets with verdicts and a track record.
(The **forfeit wheel** — dare pool + spin — was removed 2026-06-10:
`Wheel.tsx`, `/api/stakes/wheel`, `/api/stakes/forfeits*`, and the
`Forfeit`/`ForfeitSpin` tables are gone.)

| Feature | Notes | Key files |
|---|---|---|
| Claims | Prediction text (≤500) + `resolvesAt` deadline (must be future) | `src/modules/stakes/ClaimForm.tsx`, `schema.ts` |
| Bets | Optional `counterpartyId` + `stake` text; a stake requires a counterparty | `claimInput` superRefine rules |
| Hidden claims | Text masked from non-authors until resolved; can't combine with a bet (counterparty must see it) | `ClaimCard.tsx`, stakes page `toView` |
| Verdicts | Outcome `right / wrong / void`; parties or admin can resolve; admin can override | `/api/stakes/claims/[id]` PATCH, `resolveInput` |
| Favor ledger | Resolved, staked, unsettled bets → "X owes Y"; settle endpoint clears them | `/api/stakes/claims/[id]/settle`, stakes page |
| Oracle standings | Author accuracy (right/total, void excluded), computed at read time | `src/app/(app)/stakes/page.tsx` |
| The Record | `/stakes?history=1` — resolved claims, ledger, standings | same page |
| Hero banner | Overdue verdict screams; else next deadline countdown | same page |

APIs: `POST /api/stakes/claims`, `PATCH/DELETE /api/stakes/claims/[id]`, `POST .../settle`.
Prisma: `Claim`. Outbox: `claim.created/resolved/settled/deleted` ("hot takes").

## Pet — `/pet` (icon `robot-face-happy`, accent `bg-accent-sky`)

Group mascot whose state is entirely **derived from the outbox** — no
stored pet state, zero required input, collective only (never attributed
to a person). Engine: `src/modules/pet/engine.ts`.

| Feature | Notes |
|---|---|
| Mood | 5 moods (`thriving/happy/okay/sleepy/sad`) from a 7-day activity window, recent days weighted; floor is "sad", never dead |
| Diet | What the pet "ate" this week, grouped by module via event-prefix map (e.g. `claim.` → "hot takes") |
| Evolution | Stages 0–3 (`sprout/critter/regal/mythic`) from lifetime activity counts (cutoffs 0/50/200/500) |
| Beloved | Lifetime pats past a threshold → pet earns shades |
| Nudges (pats) | `POST /api/pet/nudge`, rate-limited per day (`PetNudge` table); also renameable (`pet.renamed` event) |
| Habitat | Day/night flavor from wall clock; rendering in `Creature.tsx` / `PetStage.tsx` |
| Home integration | Pet card is front-and-center on the home page (`getPetView`) |

APIs: `GET /api/pet`, `POST /api/pet/nudge`. Prisma: `PetNudge` only — everything else derived.

## Snake — `/snake` (icon `fish`, accent `bg-accent-grape`)

The one truly playable game. Canvas Snake with combos and a leaderboard.

| Feature | Notes | Key files |
|---|---|---|
| Game loop | 17×17 grid, 140 ms base tick, speeds up 6 ms per level (every 3 segments) to a 62 ms floor | `src/modules/snake/SnakeGame.tsx` (~494 lines), `schema.ts` constants |
| Scoring | Pellet 10 pts; golden snack 50 pts (every 5th eat, 6 s lifetime); combo multiplier up to ×5, decays after 2.6 s | same |
| Controls | Arrows/WASD, swipe on mobile, space pause, auto-pause on tab hide; direction queue prevents 180° self-kills | `SnakeGame.tsx` |
| Score submission | Client posts final score + meta (`maxCombo`, `length`, `bonuses`); server sanity-caps at 1M and trusts the rest (personal-use app) | `POST /api/arcade/scores` |
| Leaderboard | Computed at read time via groupBy (best per player + play count); no stored standings | `src/modules/snake/leaderboard.ts`, `/snake/page.tsx` |
| High-score / PB flags | Server compares to all-time and personal max on each submit | `scores/route.ts` |
| Events | `arcade.played` (every run, feeds pet, silent on Discord) and `arcade.highscore` (Discord "NEW RECORD" card) | `src/lib/outbox.ts`, `src/lib/discord/feed.ts` |

Prisma: `ArcadeScore` (`game` is a plain string — designed for more games later;
indexes on `(game, score)` and `(game, userId, score)`).

---

## Cross-cutting patterns (refactor notes)

- **Outbox-first**: every mutation writes a typed outbox event in the same
  transaction (`src/lib/outbox.ts`); consumers are the home feed, the pet
  engine (prefix diet map), and the Discord feed worker.
- **Derived, not stored**: leaderboards (snake, oracle standings), poll
  results, and the entire pet state are computed at read time.
- **Per-module shape**: each module is `src/modules/<name>/` (Zod `schema.ts`
  + client components) + `src/app/(app)/<name>/page.tsx` (server page, all
  queries inline) + `src/app/api/<name>/...` route handlers. Pages carry a
  lot of view-mapping/standings logic inline — a likely refactor target.
- **Threshold-vote unlock** appears twice with separate tables
  (`PollRevealVote`, `RevealUnlockVote`) — candidate for unification.
- **Registry-driven nav**: labels, icons, accents, intros and tips all live
  in `src/modules/registry.ts`.
