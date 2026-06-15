import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const GAMMA = "https://gamma-api.polymarket.com";
const SYNC_LIMIT = 900;
const EVENT_PAGE_SIZE = 100;
// Hottest-overall pull. Polymarket's top volume is ~65% politics/geopolitics, so
// this alone swamps the board — the per-topic shelves + category balancing below
// are what restore variety.
const GLOBAL_EVENT_LIMIT = 240;

// Per-topic shelves (real Gamma tag slugs, probed to confirm they return data).
// Under-served categories — tech, culture, sports variety incl. the World Cup —
// get the fattest limits; politics is intentionally thin because the global pull
// already over-supplies it. An unknown/empty slug just returns nothing, harmless.
const TOPICAL_SHELVES: { slug: string; limit: number }[] = [
  // Tech
  { slug: "tech", limit: 60 },
  { slug: "ai", limit: 60 },
  { slug: "elon-musk", limit: 30 },
  { slug: "openai", limit: 25 },
  { slug: "space", limit: 20 },
  // Culture
  { slug: "pop-culture", limit: 60 },
  { slug: "movies", limit: 40 },
  { slug: "music", limit: 40 },
  { slug: "celebrities", limit: 40 },
  { slug: "awards", limit: 20 },
  { slug: "esports", limit: 30 },
  // Sports (the World Cup lives under soccer / world-cup / fifa-world-cup)
  { slug: "world-cup", limit: 60 },
  { slug: "fifa-world-cup", limit: 40 },
  { slug: "soccer", limit: 50 },
  { slug: "nfl", limit: 30 },
  { slug: "nba", limit: 30 },
  { slug: "tennis", limit: 25 },
  { slug: "ufc", limit: 25 },
  { slug: "f1", limit: 20 },
  // Crypto / Business / Science
  { slug: "crypto", limit: 40 },
  { slug: "bitcoin", limit: 25 },
  { slug: "business", limit: 30 },
  { slug: "economy", limit: 30 },
  { slug: "finance", limit: 25 },
  { slug: "science", limit: 40 },
  // World / Politics — thin on purpose; the global pull carries these
  { slug: "world", limit: 30 },
  { slug: "geopolitics", limit: 25 },
  { slug: "politics", limit: 20 },
];

type RawMarket = Record<string, unknown>;
type RawEvent = Record<string, unknown>;

export type NormalizedBookMarket = {
  polymarketId: string;
  slug: string | null;
  question: string;
  category: string | null;
  eventTitle: string | null;
  description: string | null;
  image: string | null;
  outcomes: ["Yes", "No"];
  outcomePrices: [number, number];
  tags: string[] | null;
  volume: number | null;
  volume24hr: number | null;
  liquidity: number | null;
  spread: number | null;
  conditionId: string | null;
  clobTokenIds: string[] | null;
  endDate: Date | null;
  active: boolean;
  closed: boolean;
  resolvedOutcome: "Yes" | "No" | null;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): Date | null {
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseArray(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseBinaryOutcomes(v: unknown): ["Yes", "No"] | null {
  const arr = parseArray(v)?.map((x) => String(x));
  if (!arr || arr.length !== 2) return null;
  const yesIndex = arr.findIndex((x) => x.toLowerCase() === "yes");
  const noIndex = arr.findIndex((x) => x.toLowerCase() === "no");
  return yesIndex >= 0 && noIndex >= 0 ? ["Yes", "No"] : null;
}

function parsePrices(rawOutcomes: unknown, rawPrices: unknown): [number, number] | null {
  const outcomes = parseArray(rawOutcomes)?.map((x) => String(x).toLowerCase());
  const prices = parseArray(rawPrices)?.map((x) => Number(x));
  if (!outcomes || !prices || outcomes.length !== 2 || prices.length !== 2) return null;
  const yesIndex = outcomes.findIndex((x) => x === "yes");
  const noIndex = outcomes.findIndex((x) => x === "no");
  if (yesIndex < 0 || noIndex < 0) return null;
  const yes = prices[yesIndex];
  const no = prices[noIndex];
  if (![yes, no].every((p) => Number.isFinite(p) && p > 0 && p < 1)) return null;
  return [yes, no];
}

function parseResolvedPrices(rawOutcomes: unknown, rawPrices: unknown): [number, number] | null {
  const outcomes = parseArray(rawOutcomes)?.map((x) => String(x).toLowerCase());
  const prices = parseArray(rawPrices)?.map((x) => Number(x));
  if (!outcomes || !prices || outcomes.length !== 2 || prices.length !== 2) return null;
  const yesIndex = outcomes.findIndex((x) => x === "yes");
  const noIndex = outcomes.findIndex((x) => x === "no");
  if (yesIndex < 0 || noIndex < 0) return null;
  const yes = prices[yesIndex];
  const no = prices[noIndex];
  if (![yes, no].every((p) => Number.isFinite(p) && p >= 0 && p <= 1)) return null;
  return [yes, no];
}

function inferResolvedOutcome(rawOutcomes: unknown, rawPrices: unknown, closed: boolean): "Yes" | "No" | null {
  if (!closed) return null;
  const prices = parseResolvedPrices(rawOutcomes, rawPrices);
  if (!prices) return null;
  const [yes, no] = prices;
  if (yes >= 0.99 && no <= 0.01) return "Yes";
  if (no >= 0.99 && yes <= 0.01) return "No";
  return null;
}

function tagLabels(v: unknown): string[] | null {
  const tags = parseArray(v)
    ?.map((tag) => {
      if (typeof tag === "string") return tag;
      return asString((tag as Record<string, unknown>)?.label);
    })
    .filter((x): x is string => !!x);
  return tags?.length ? [...new Set(tags)] : null;
}

// Canonical category per tag, by EXACT (normalized) label match. Exact-set
// lookup — not substring — so "ukraine" never reads as "ai" and "warriors"
// never reads as "war". Hyphens are normalized to spaces so a tag_slug
// ("world-cup", "pop-culture", "elon-musk") matches the same entry as its label.
const CATEGORY_TAGS: Record<string, string[]> = {
  Sports: [
    "sports", "nba", "nfl", "mlb", "nhl", "soccer", "tennis", "fifa", "football",
    "baseball", "basketball", "ufc", "mma", "boxing", "f1", "formula 1", "golf",
    "hockey", "olympics", "epl", "premier league", "la liga", "champions league",
    "world cup", "fifa world cup", "cricket", "nascar",
  ],
  Crypto: ["crypto", "bitcoin", "ethereum", "solana", "crypto prices", "memecoins", "dogecoin", "altcoins"],
  Tech: [
    "tech", "technology", "ai", "artificial intelligence", "openai", "elon musk",
    "spacex", "space", "semiconductors", "nvidia", "apple", "google", "software", "gadgets",
  ],
  Culture: [
    "culture", "pop culture", "music", "movies", "movie", "film", "tv", "television",
    "streaming", "entertainment", "celebrity", "celebrities", "awards", "oscars",
    "grammys", "emmys", "box office", "esports", "gaming", "kpop",
  ],
  Business: [
    "business", "finance", "economy", "economic policy", "fed", "rates", "stocks",
    "ipos", "earnings", "jobs", "inflation", "gdp", "markets",
  ],
  Politics: [
    "politics", "elections", "election", "global elections", "world elections",
    "main election", "trump", "congress", "senate", "primary",
  ],
  World: [
    "world", "geopolitics", "international affairs", "iran", "israel", "ukraine",
    "russia", "china", "middle east", "gaza", "ceasefire", "iran ceasefire", "nato",
    "north korea", "oil", "peace deal", "war",
  ],
  Science: ["science", "climate", "weather", "nasa", "health", "covid", "physics", "biology"],
};

const TAG_TO_CATEGORY: Map<string, string> = (() => {
  const m = new Map<string, string>();
  // First writer wins, so order CATEGORY_TAGS by priority for shared keys
  // (e.g. "space" → Tech before Science).
  for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
    for (const tag of tags) if (!m.has(tag)) m.set(tag, category);
  }
  return m;
})();

function canonicalCategory(v: string | null): string | null {
  const s = v?.toLowerCase().trim().replace(/-/g, " ");
  if (!s) return null;
  return TAG_TO_CATEGORY.get(s) ?? null;
}

function categoryFrom(tags: string[] | null, fallback: string | null, sourceTag: string | null): string | null {
  for (const tag of tags ?? []) {
    const category = canonicalCategory(tag);
    if (category) return category;
  }
  return canonicalCategory(fallback) ?? canonicalCategory(sourceTag) ?? fallback;
}

function extractMarkets(payload: unknown): RawMarket[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const event = item as RawEvent;
      const markets = parseArray(event.markets);
      return markets
        ? (markets as RawMarket[]).map((m) => ({ ...m, __event: event }))
        : [event as RawMarket];
    });
  }
  const data = (payload as Record<string, unknown>)?.data;
  return Array.isArray(data) ? (data as RawMarket[]) : [];
}

export function normalizeMarket(m: RawMarket): NormalizedBookMarket | null {
  const id = asString(m.id) ?? asString(m.conditionId);
  const question = asString(m.question) ?? asString(m.title);
  if (!id || !question) return null;

  const outcomes = parseBinaryOutcomes(m.outcomes);
  const active = asBool(m.active, true);
  const closed = asBool(m.closed, false);
  const outcomePrices = closed
    ? parseResolvedPrices(m.outcomes, m.outcomePrices)
    : parsePrices(m.outcomes, m.outcomePrices);
  if (!outcomes || !outcomePrices) return null;

  const endDate = asDate(m.endDate) ?? asDate(m.end_date) ?? asDate(m.gameStartTime);
  if (!closed && endDate && endDate.getTime() < Date.now()) return null;

  const tokenIds = parseArray(m.clobTokenIds)?.map(String) ?? parseArray(m.clobTokenIdsRaw)?.map(String) ?? null;
  const event = (m.__event as RawEvent | undefined) ?? {};
  const tags = tagLabels(m.tags) ?? tagLabels(event.tags);
  const sourceTag = asString(event.__sourceTag) ?? asString(m.__sourceTag);
  const category = categoryFrom(
    tags,
    asString(m.category) ?? asString(event.category) ?? asString(m.groupItemTitle),
    sourceTag
  );

  return {
    polymarketId: id,
    slug: asString(m.slug),
    question,
    category,
    eventTitle: asString(event.title),
    description: asString(m.description) ?? asString(event.description),
    image: asString(m.image) ?? asString(m.icon),
    outcomes,
    outcomePrices,
    tags,
    volume: asNumber(m.volumeNum) ?? asNumber(m.volume) ?? asNumber(event.volume),
    volume24hr: asNumber(m.volume24hr) ?? asNumber(m.volume24hrClob) ?? asNumber(event.volume24hr),
    liquidity: asNumber(m.liquidityNum) ?? asNumber(m.liquidity) ?? asNumber(event.liquidity),
    spread: asNumber(m.spread),
    conditionId: asString(m.conditionId),
    clobTokenIds: tokenIds,
    endDate,
    active,
    closed,
    resolvedOutcome: inferResolvedOutcome(m.outcomes, m.outcomePrices, closed),
  };
}

/**
 * Pick markets so the board stays varied instead of being a wall of politics.
 * Markets are grouped by canonical category, each group sorted hottest-first,
 * then drawn round-robin (one per category per pass) with a soft per-category
 * cap. So the head of the board alternates politics / sports / tech / culture,
 * and no single category can take more than ~`capRatio` of the slots until the
 * smaller categories are exhausted.
 */
function selectBalanced(markets: NormalizedBookMarket[], limit: number): NormalizedBookMarket[] {
  const cap = Math.max(80, Math.ceil(limit * 0.22));
  const groups = new Map<string, NormalizedBookMarket[]>();
  for (const m of markets) {
    const key = m.category ?? "Other";
    const group = groups.get(key) ?? [];
    group.push(m);
    groups.set(key, group);
  }
  const byVolume = (a: NormalizedBookMarket, b: NormalizedBookMarket) =>
    (b.volume24hr ?? 0) - (a.volume24hr ?? 0) || (b.volume ?? 0) - (a.volume ?? 0);
  for (const group of groups.values()) group.sort(byVolume);

  // Hottest categories lead each pass; uncategorized ("Other") always goes last.
  const order = [...groups.entries()]
    .sort((a, b) => {
      if (a[0] === "Other") return 1;
      if (b[0] === "Other") return -1;
      return (b[1][0]?.volume24hr ?? 0) - (a[1][0]?.volume24hr ?? 0);
    })
    .map(([key]) => key);

  const out: NormalizedBookMarket[] = [];
  const taken = new Map(order.map((k) => [k, 0]));
  for (let pass = 0, progressed = true; out.length < limit && progressed; pass += 1) {
    progressed = false;
    for (const key of order) {
      if (out.length >= limit) break;
      const group = groups.get(key)!;
      const t = taken.get(key)!;
      if (group[pass] && t < cap) {
        out.push(group[pass]);
        taken.set(key, t + 1);
        progressed = true;
      }
    }
  }
  // If every category hit its cap but we're still short, top up by raw volume so
  // we never under-fill the board.
  if (out.length < limit) {
    const seen = new Set(out.map((m) => m.polymarketId));
    for (const m of markets.slice().sort(byVolume)) {
      if (out.length >= limit) break;
      if (!seen.has(m.polymarketId)) {
        out.push(m);
        seen.add(m.polymarketId);
      }
    }
  }
  return out;
}

export async function fetchPolymarketMarkets(limit = SYNC_LIMIT): Promise<NormalizedBookMarket[]> {
  const globalCount = Math.min(GLOBAL_EVENT_LIMIT, limit);
  const payload: unknown[] = [];
  for (let offset = 0; offset < globalCount; offset += EVENT_PAGE_SIZE) {
    const url = new URL(`${GAMMA}/events`);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");
    url.searchParams.set("limit", String(Math.min(EVENT_PAGE_SIZE, globalCount - offset)));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Polymarket sync failed (${res.status})`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    payload.push(...page);
  }

  await Promise.all(
    TOPICAL_SHELVES.map(async ({ slug, limit: shelfLimit }) => {
      const url = new URL(`${GAMMA}/events`);
      url.searchParams.set("active", "true");
      url.searchParams.set("closed", "false");
      url.searchParams.set("order", "volume24hr");
      url.searchParams.set("ascending", "false");
      url.searchParams.set("tag_slug", slug);
      url.searchParams.set("limit", String(shelfLimit));
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) return;
      const page = await res.json();
      if (!Array.isArray(page)) return;
      payload.push(...page.map((event) => ({ ...(event as RawEvent), __sourceTag: slug })));
    })
  );

  const seen = new Set<string>();
  const deduped = extractMarkets(payload)
    .map(normalizeMarket)
    .filter((m): m is NormalizedBookMarket => {
      if (!m || seen.has(m.polymarketId)) return false;
      seen.add(m.polymarketId);
      return true;
    });

  return selectBalanced(deduped, limit);
}

export async function fetchPolymarketMarketBySlug(slug: string): Promise<NormalizedBookMarket | null> {
  const url = new URL(`${GAMMA}/markets`);
  url.searchParams.set("slug", slug);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const payload = await res.json();
  return extractMarkets(payload).map(normalizeMarket).find(Boolean) ?? null;
}

export async function upsertMarkets(markets: NormalizedBookMarket[]) {
  for (const m of markets) {
    await db.bookMarket.upsert({
      where: { polymarketId: m.polymarketId },
      update: toDb(m),
      create: toDb(m),
    });
  }
}

function toDb(m: NormalizedBookMarket): Prisma.BookMarketCreateInput {
  return {
    polymarketId: m.polymarketId,
    slug: m.slug,
    question: m.question,
    category: m.category,
    eventTitle: m.eventTitle,
    description: m.description,
    image: m.image,
    outcomes: m.outcomes,
    outcomePrices: m.outcomePrices,
    tags: m.tags ?? undefined,
    volume: m.volume,
    volume24hr: m.volume24hr,
    liquidity: m.liquidity,
    spread: m.spread,
    conditionId: m.conditionId,
    clobTokenIds: m.clobTokenIds ?? undefined,
    endDate: m.endDate,
    active: m.active,
    closed: m.closed,
    resolvedOutcome: m.resolvedOutcome,
    lastSyncedAt: new Date(),
  };
}

export async function syncBookMarkets() {
  const markets = await fetchPolymarketMarkets();
  await upsertMarkets(markets);
  return markets.length;
}

export async function refreshBookMarket(marketId: string) {
  const local = await db.bookMarket.findUnique({ where: { id: marketId } });
  if (!local?.slug) return local;
  const fresh = await fetchPolymarketMarketBySlug(local.slug);
  if (!fresh) return local;
  const merged = {
    ...fresh,
    category: fresh.category ?? local.category,
    eventTitle: fresh.eventTitle ?? local.eventTitle,
    description: fresh.description ?? local.description,
    tags: fresh.tags ?? (Array.isArray(local.tags) ? local.tags.map(String) : null),
    volume: fresh.volume ?? local.volume,
    volume24hr: fresh.volume24hr ?? local.volume24hr,
    liquidity: fresh.liquidity ?? local.liquidity,
    spread: fresh.spread ?? local.spread,
  };
  return db.bookMarket.update({
    where: { id: marketId },
    data: toDb(merged),
  });
}

export function pricesFor(market: { outcomePrices: Prisma.JsonValue }): [number, number] | null {
  const arr = Array.isArray(market.outcomePrices) ? market.outcomePrices.map(Number) : null;
  if (!arr || arr.length !== 2 || arr.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1)) return null;
  return [arr[0], arr[1]];
}

export function priceForOutcome(market: { outcomePrices: Prisma.JsonValue }, outcome: "Yes" | "No") {
  const prices = pricesFor(market);
  return prices ? prices[outcome === "Yes" ? 0 : 1] : null;
}

export function potentialPayout(stake: number, price: number) {
  return Math.max(0, Math.floor(stake / price));
}
