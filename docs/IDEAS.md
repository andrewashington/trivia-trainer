# UDM+ module backlog

Ten candidate modules that fit the platform (each is a folder + a
registry entry + a few API routes — no shell changes). Ordered roughly
by bang-for-buck. External services listed are free or nearly free at
friend-group scale.

## 1. Polls & Decisions 🗳️
The single highest-leverage add for a group chat crowd: "which
restaurant?", "which weekend works?", ranked or simple votes, optional
deadline, results bar charts in brutalist style. Pairs perfectly with
the outbox → future Discord bot ("vote now: …"). **No external deps.**

## 2. Tabs & Splits 💸
Splitwise-lite: log shared expenses ("I got the pizzas — $42"), pick
who's in, and let the app maintain simplified who-owes-who balances.
Settle-up just zeroes the pair. The math is ~50 lines; the value is
huge. **No external deps** (currency stays USD or a config constant).

## 3. Photo Albums 📸
Event-linked galleries ("Lake Day '26"). Reuses the existing S3 +
presigned-URL infra wholesale; add `sharp` for server-side thumbnails.
The Files module already proves the upload path. **Library: sharp
(free).** Storage cost stays pennies on R2/B2.

## 4. Movie Night 🍿
A shared watch-queue with voting — distinct from Now Playing (which is
"what I'm into"), this is "what should WE watch together". **API: TMDB
(free key)** for search, posters, runtime, and where-to-stream data;
one fetch on add, cached in your DB.

## 5. ~~The Map 🗺️~~ — SHIPPED
Group atlas: favorite restaurants, the good taco truck, "Dave's new
apartment", trip pins. Built with Leaflet + OpenStreetMap tiles +
Nominatim geocoding — zero API keys, as promised.

## 6. Quotes Board 💬
The inside-jokes archive: "things we said at 2am", attributed and
dated, random-quote widget on the home dashboard. Trivially simple
model (text + who said it + who heard it), enormous delight per line
of code. **No external deps.**

## 7. Game Night Leaderboard 🏆
Log board-game/Mario-Kart sessions and results; running win counts,
streaks, and an ELO-ish ranking per game. **API: BoardGameGeek XML API
(free, no key)** for game art/metadata lookup on add.

## 8. Countdowns ⏳
Big chunky countdown tiles: the trip, the wedding, the concert. Can
auto-pull birthdays from the Address Book and big events from Events,
plus arbitrary custom dates. Great home-dashboard tile. **No external
deps.**

## 9. Book/Watch Club 📖
Structured "we're all doing this one together": a current pick, a
schedule/checkpoint list, and spoiler-walled discussion threads per
checkpoint (the spoiler wall is the killer feature). **APIs: Open
Library (free, no key)** for book covers; TMDB if the pick is a show.

## 10. Weather Ribbon for Events ☀️
Smallest one: attach a forecast to upcoming outdoor events ("Lake day:
82° and sunny 🌞"), shown on the event card once it's within 10 days.
**API: Open-Meteo (free, no key, no signup)** + the event's location
geocoded once via Nominatim. Technically an Events enhancement, but it
can ship as its own module-style folder with one cron-ish fetch.

---

### Honorable mentions
- **Shared shopping/packing lists** (no deps; pairs with Events)
- **Playlist exchange** via Spotify oEmbed (free, no auth for embeds)
- **"Where I'm at" status board** — one-line manual check-ins
- **Recipe → grocery list** bridge once shopping lists exist

### Pattern to keep
Every module so far is: Prisma model(s) → zod schema → `/api` routes
with `withOutbox` writes → server-component page + small client
islands → registry entry. Keep new ones on that rail and the Discord
bot phase inherits them all for free.
