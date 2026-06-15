"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";
import { MIN_BET, MAX_BET } from "@/modules/arcade/constants";

type MarketView = {
  id: string;
  question: string;
  category: string | null;
  eventTitle: string | null;
  description: string | null;
  image: string | null;
  outcomePrices: unknown;
  tags: unknown;
  volume: number | null;
  volume24hr: number | null;
  liquidity: number | null;
  spread: number | null;
  endDate: string | null;
};

type BetView = {
  id: string;
  outcome: string;
  stake: number;
  price: number;
  potentialPayout: number;
  status: string;
  createdAt: string;
  settledAt: string | null;
  market: {
    question: string;
    resolvedOutcome: string | null;
  };
};

function parsePrices(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const prices = v.map(Number);
  return prices.every((p) => Number.isFinite(p) && p > 0 && p < 1)
    ? [prices[0], prices[1]]
    : null;
}

function oddsLabel(price: number) {
  return `${Math.round(price * 100)}%`;
}

function payout(stake: number, price: number) {
  return Math.max(0, Math.floor(stake / price));
}

function fmtDate(iso: string | null) {
  if (!iso) return "No bell posted";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" });
}

function compactMoney(n: number | null) {
  if (!n) return "0";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function tagList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 4) : [];
}

// Each canonical category gets its own loud accent — drives the card header
// gradient so you can read the "shelf" at a glance without reading a word.
const CATEGORY_COLOR: Record<string, string> = {
  Sports: "#0B9E63",
  Crypto: "#FF9F1C",
  Tech: "#00CFE8",
  Culture: "#FF6FB5",
  Business: "#16C2A3",
  Politics: "#9B5DE5",
  World: "#38BDF8",
  Science: "#B5E631",
};

function categoryColor(cat: string | null) {
  return (cat && CATEGORY_COLOR[cat]) || "#243B8F";
}

// A flavorful stand-in icon when a market has no image (or a dead one).
const CATEGORY_ICON: Record<string, IconName> = {
  Sports: "trophy",
  Crypto: "money",
  Tech: "robot-face-happy",
  Culture: "clapperboard",
  Business: "chart-bar-big",
  Politics: "scale",
  World: "earth",
  Science: "lightbulb",
};

function categoryIcon(cat: string | null): IconName {
  return (cat && CATEGORY_ICON[cat]) || "notebook";
}

// Polymarket thumbnails are frequently missing OR a dead URL. Render the image
// when it actually loads; otherwise fall back to a category-flavored icon tile
// so a card never shows a broken-image glyph.
function MarketThumb({ src, category }: { src: string | null; category: string | null }) {
  const [ok, setOk] = useState(true);
  if (src && ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setOk(false)}
        className="relative h-14 w-14 shrink-0 rounded-md border-2 border-ink object-cover shadow-brutal-sm"
      />
    );
  }
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-card shadow-brutal-sm">
      <PixelIcon name={categoryIcon(category)} size={24} />
    </div>
  );
}

// Diagonal brutalist hatch reused on headers + probability bars for texture.
const STRIPES =
  "repeating-linear-gradient(45deg, rgba(0,0,0,0.10) 0, rgba(0,0,0,0.10) 6px, transparent 6px, transparent 12px)";

// Read the shape of the line straight off the odds: a near-lock, a favorite,
// a lean, or a genuine coin toss — each with its own chip color + icon.
function oddsTier(yes: number, no: number): { label: string; icon: IconName; bg: string; fg: string } {
  const top = Math.max(yes, no);
  if (top >= 0.85) return { label: "Near lock", icon: "lock", bg: "bg-ink", fg: "text-white" };
  if (top >= 0.68) return { label: "Favorite", icon: "crown", bg: "bg-accent-green", fg: "text-ink" };
  if (top >= 0.58) return { label: "Leaning", icon: "chart-bar-big", bg: "bg-accent-yellow", fg: "text-ink" };
  return { label: "Coin toss", icon: "scale", bg: "bg-accent-cyan", fg: "text-ink" };
}

// Quick-pick unit sizes and the odds-ladder we preview a unit's payout against.
const STAKE_PRESETS = [10, 25, 50, 100, 250, 1000];
const PAYOUT_LADDER = [0.9, 0.7, 0.5, 0.3, 0.1];

function clampStake(n: number, cap = MAX_BET) {
  return Math.max(MIN_BET, Math.min(cap, Math.round(Number.isFinite(n) ? n : MIN_BET)));
}

// Shared coin-amount editor: −/+ steppers, a typed field, and preset chips.
// Used both for the board-level unit and inside the confirm-bet modal.
function StakeEditor({
  value,
  onChange,
  cap = MAX_BET,
  showMax = false,
}: {
  value: number;
  onChange: (n: number) => void;
  cap?: number;
  showMax?: boolean;
}) {
  const set = (n: number) => onChange(clampStake(n, cap));
  const step = value >= 100 ? 50 : 10;
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => set(value - step)}
          className="brutal-press border-3 border-ink bg-card px-3 font-display text-2xl font-bold leading-none shadow-brutal-sm"
          aria-label="Decrease amount"
        >
          −
        </button>
        <input
          type="number"
          min={MIN_BET}
          max={cap}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="brutal-input w-full text-center font-display text-xl font-bold"
          aria-label="Bet amount"
        />
        <button
          type="button"
          onClick={() => set(value + step)}
          className="brutal-press border-3 border-ink bg-card px-3 font-display text-2xl font-bold leading-none shadow-brutal-sm"
          aria-label="Increase amount"
        >
          +
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STAKE_PRESETS.filter((p) => p <= cap).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => set(p)}
            className={`brutal-press border-2 border-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase shadow-brutal-sm ${
              value === p ? "bg-ink text-white" : "bg-card text-ink"
            }`}
          >
            {p.toLocaleString()}
          </button>
        ))}
        {showMax && (
          <button
            type="button"
            onClick={() => set(cap)}
            className="brutal-press border-2 border-ink bg-accent-yellow px-2.5 py-1 font-mono text-[11px] font-bold uppercase shadow-brutal-sm"
          >
            Max
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "won"
      ? "bg-accent-green text-ink"
      : status === "lost"
        ? "bg-accent-red text-white"
        : status === "void"
          ? "bg-paper text-ink"
          : "bg-accent-yellow text-ink";
  return <Badge className={cls}>{status}</Badge>;
}

function marketVolume(m: MarketView) {
  return (m.volume24hr ?? 0) * 10 + (m.volume ?? 0) + (m.liquidity ?? 0) * 0.5;
}

function sortedForMode(markets: MarketView[], sort: "hot" | "soon" | "liquid") {
  if (sort === "soon") {
    return [...markets].sort(
      (a, b) =>
        (a.endDate ? new Date(a.endDate).getTime() : Number.MAX_SAFE_INTEGER) -
        (b.endDate ? new Date(b.endDate).getTime() : Number.MAX_SAFE_INTEGER)
    );
  }
  if (sort === "liquid") {
    return [...markets].sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
  }
  return [...markets].sort((a, b) => marketVolume(b) - marketVolume(a));
}

function interleaveCategories(markets: MarketView[]) {
  const groups = new Map<string, MarketView[]>();
  for (const market of markets) {
    const key = market.category ?? "Other";
    const group = groups.get(key) ?? [];
    group.push(market);
    groups.set(key, group);
  }
  const orderedGroups = [...groups.values()].sort(
    (a, b) => marketVolume(b[0]) - marketVolume(a[0])
  );
  const out: MarketView[] = [];
  let i = 0;
  while (out.length < markets.length) {
    let added = false;
    for (const group of orderedGroups) {
      if (group[i]) {
        out.push(group[i]);
        added = true;
      }
    }
    if (!added) break;
    i += 1;
  }
  return out;
}

type SpotlightCard = {
  key: string;
  label: string;
  icon: "fire" | "clock" | "sparkles" | "chart-bar-big" | "trophy" | "notebook";
  market: MarketView;
  detail: string;
  dark?: boolean;
  yellow?: boolean;
};

export function BookBoard({
  initialMarkets,
  initialBets,
  initialCoins,
}: {
  initialMarkets: MarketView[];
  initialBets: BetView[];
  initialCoins: number;
}) {
  const router = useRouter();
  const [markets, setMarkets] = useState(initialMarkets);
  const [bets, setBets] = useState(initialBets);
  const [coins, setCoins] = useState(initialCoins);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<"hot" | "soon" | "liquid">("hot");
  const [stake, setStake] = useState(Math.max(MIN_BET, 25));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"lines" | "open" | "settled">("lines");
  const [lastSlip, setLastSlip] = useState<{ question: string; outcome: string; stake: number; payout: number } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<{ market: MarketView; outcome: "Yes" | "No"; price: number } | null>(null);
  const [slipStake, setSlipStake] = useState(Math.max(MIN_BET, 25));
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Probability bars grow from a 50/50 split on first paint for a little drama.
  useEffect(() => setMounted(true), []);

  // Esc closes the confirm-bet modal.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  // Ribbon → board: hop to the market a spotlight card points at and flash it.
  function focusMarket(id: string) {
    setView("lines");
    requestAnimationFrame(() => {
      cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setFlashId(null);
    requestAnimationFrame(() => setFlashId(id));
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500);
  }

  const openBets = bets.filter((b) => b.status === "open");
  const resolvedBets = bets.filter((b) => b.status !== "open").slice(0, 8);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return markets.filter((m) => {
      const matchesCategory = category === "All" || m.category === category;
      const matchesQuery =
        !q ||
        `${m.question} ${m.category ?? ""} ${tagList(m.tags).join(" ")} ${m.eventTitle ?? ""}`
          .toLowerCase()
          .includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [markets, query, category]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const market of markets) {
      if (!market.category) continue;
      counts.set(market.category, (counts.get(market.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  }, [markets]);

  const displayedMarkets = useMemo(() => {
    const sorted = sortedForMode(filtered, sort);
    return sort === "hot" && category === "All" ? interleaveCategories(sorted) : sorted;
  }, [filtered, sort, category]);

  const spotlightCards = useMemo<SpotlightCard[]>(() => {
    const priced = displayedMarkets
      .map((market) => ({ market, prices: parsePrices(market.outcomePrices) }))
      .filter((x): x is { market: MarketView; prices: [number, number] } => !!x.prices);
    const hot = [...priced].sort((a, b) => marketVolume(b.market) - marketVolume(a.market))[0];
    const soon = [...priced]
      .filter((x) => x.market.endDate)
      .sort((a, b) => new Date(a.market.endDate!).getTime() - new Date(b.market.endDate!).getTime())[0];
    const moonshot = [...priced]
      .map((x) => {
        const yesLong = x.prices[0] <= x.prices[1];
        return {
          ...x,
          side: yesLong ? "Yes" : "No",
          price: yesLong ? x.prices[0] : x.prices[1],
        };
      })
      .filter((x) => x.price > 0.01)
      .sort((a, b) => a.price - b.price)[0];

    const cards: SpotlightCard[] = [];
    if (hot) {
      cards.push({
        key: `hot:${hot.market.id}`,
        label: "Hot ticket",
        icon: "fire",
        market: hot.market,
        detail: `24h ${compactMoney(hot.market.volume24hr)} · liq ${compactMoney(hot.market.liquidity)}`,
        yellow: true,
      });
    }
    if (soon) {
      cards.push({
        key: `soon:${soon.market.id}`,
        label: "Closing bell",
        icon: "clock",
        market: soon.market,
        detail: `closes ${fmtDate(soon.market.endDate)}`,
      });
    }
    if (moonshot) {
      cards.push({
        key: `moon:${moonshot.market.id}`,
        label: "Moonshot",
        icon: "sparkles",
        market: moonshot.market,
        detail: `${moonshot.side} · odds ${oddsLabel(moonshot.price)} · pays ${payout(stake, moonshot.price).toLocaleString()}`,
        dark: true,
      });
    }

    const used = new Set(cards.map((card) => card.market.id));
    const categoryLeaders = new Map<string, MarketView>();
    for (const market of displayedMarkets) {
      if (used.has(market.id)) continue;
      const key = market.category ?? "Other";
      const current = categoryLeaders.get(key);
      if (!current || marketVolume(market) > marketVolume(current)) {
        categoryLeaders.set(key, market);
      }
    }
    for (const [name, market] of categoryLeaders) {
      cards.push({
        key: `cat:${name}:${market.id}`,
        label: `${name} line`,
        icon: name === "Sports" ? "trophy" : name === "Crypto" || name === "Business" ? "chart-bar-big" : "notebook",
        market,
        detail: `24h ${compactMoney(market.volume24hr)} · closes ${fmtDate(market.endDate)}`,
      });
      if (cards.length >= 12) break;
    }
    return cards;
  }, [displayedMarkets]);

  async function refresh() {
    setNotice("Checking the board...");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category !== "All") params.set("category", category);
      params.set("sort", sort);
      const data = await api<{ markets: MarketView[]; bets: BetView[]; coins: number }>(
        `/api/book${params.size ? `?${params}` : ""}`
      );
      setMarkets(data.markets);
      setBets(data.bets);
      setCoins(data.coins);
      setNotice("Board refreshed.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not refresh The Book.");
    }
  }

  // Tapping a side no longer fires the bet — it opens the confirm modal,
  // preset to the board unit (clamped to what you can actually afford).
  function openBet(market: MarketView, outcome: "Yes" | "No", price: number) {
    setNotice(null);
    const cap = Math.min(MAX_BET, coins);
    setSlipStake(clampStake(Math.min(stake, cap), cap));
    setPending({ market, outcome, price });
  }

  async function submitBet() {
    if (!pending) return;
    const { market, outcome, price } = pending;
    const amount = clampStake(slipStake, Math.min(MAX_BET, coins));
    const key = `${market.id}:${outcome}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const data = await api<{ coins: number }>("/api/book/bets", {
        method: "POST",
        body: { marketId: market.id, outcome, stake: amount },
      });
      const win = payout(amount, price);
      setCoins(data.coins);
      setLastSlip({ question: market.question, outcome, stake: amount, payout: win });
      setPending(null);
      setView("open");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The ticket window jammed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card className="overflow-hidden !p-0">
        <div className="grid bg-accent-book text-white md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="p-5 sm:p-6">
            <p className="brutal-label !text-white/70">The internet has odds. You have coins.</p>
            <h2 className="max-w-2xl font-display text-4xl font-bold leading-none sm:text-5xl">
              Buy a tiny slice of fate.
            </h2>
            <p className="mt-3 max-w-xl text-sm font-bold text-white/75">
              Browse real-world lines, print a coin slip, and let Polymarket settle the argument later.
            </p>
          </div>
          <div className="border-t-3 border-ink bg-card p-5 text-ink md:border-l-3 md:border-t-0">
            <p className="brutal-label !mb-1">Balance</p>
            <p className="font-display text-4xl font-bold">{coins.toLocaleString()}</p>
            <p className="mt-1 font-mono text-[10px] uppercase text-ink/45">coins ready at the window</p>
          </div>
        </div>
      </Card>

      {/* The unit dial: set how many coins one slip costs, and read the payout
          ladder so the relative value of long vs. short odds is obvious. */}
      <Card className="overflow-hidden !p-0">
        <div className="grid md:grid-cols-[minmax(0,300px)_1fr]">
          <div className="relative border-b-3 border-ink bg-accent-yellow p-4 md:border-b-0 md:border-r-3">
            <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: STRIPES }} />
            <div className="relative">
              <p className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="money" size={14} /> Your bet unit
              </p>
              <p className="font-display text-5xl font-bold leading-none">{stake.toLocaleString()}</p>
              <p className="mb-3 font-mono text-[10px] uppercase text-ink/55">coins per slip · adjustable at confirm</p>
              <StakeEditor value={stake} onChange={setStake} />
            </div>
          </div>
          <div className="p-4">
            <p className="brutal-label">What a {stake.toLocaleString()}-coin slip returns</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {PAYOUT_LADDER.map((p) => (
                <div key={p} className="border-2 border-ink bg-paper p-2 text-center">
                  <p className="font-mono text-[10px] font-bold uppercase text-ink/50">{oddsLabel(p)}</p>
                  <p className="font-display text-lg font-bold leading-none">{payout(stake, p).toLocaleString()}</p>
                  <p className="font-mono text-[9px] font-bold uppercase text-accent-green">
                    +{(payout(stake, p) - stake).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase text-ink/40">
              longer the odds, fatter the payout · tap a side on any line to bet
            </p>
          </div>
        </div>
      </Card>

      {lastSlip && (
        <div className="relative animate-pop-in overflow-hidden border-3 border-ink bg-accent-yellow p-4 shadow-brutal">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: STRIPES }} />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="party-popper" size={14} /> Ticket printed
              </p>
              <p className="font-display text-xl font-bold">
                {lastSlip.outcome} for {lastSlip.stake} coins
              </p>
              <p className="mt-0.5 line-clamp-1 font-mono text-[10px] uppercase text-ink/55">{lastSlip.question}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="border-2 border-ink bg-card px-3 py-1 font-display text-xl font-bold shadow-brutal-sm">
                Pays {lastSlip.payout.toLocaleString()}
              </p>
              <span className="animate-stamp-in border-3 border-accent-red px-2 py-1 font-display text-sm font-bold uppercase text-accent-red">
                Live
              </span>
            </div>
          </div>
        </div>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {([
            ["lines", "Lines", displayedMarkets.length],
            ["open", "Open slips", openBets.length],
            ["settled", "Settled", resolvedBets.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`brutal-press border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
                view === key ? "bg-ink text-white" : "bg-card text-ink"
              }`}
            >
              {label} <span className="opacity-60">({count})</span>
            </button>
          ))}
        </div>

        {view === "lines" && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_150px_auto]">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions, tags, events..."
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "hot" | "soon" | "liquid")}
                className="brutal-input"
                aria-label="Sort lines"
              >
                <option value="hot">Hot first</option>
                <option value="soon">Closing soon</option>
                <option value="liquid">Most liquid</option>
              </select>
              <Button type="button" variant="ghost" onClick={refresh}>
                Refresh
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategory("All")}
                className={`shrink-0 border-2 border-ink px-3 py-1 font-mono text-[10px] font-bold uppercase shadow-brutal-sm ${
                  category === "All" ? "bg-accent-yellow text-ink" : "bg-card text-ink"
                }`}
              >
                All ({markets.length})
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  className={`shrink-0 border-2 border-ink px-3 py-1 font-mono text-[10px] font-bold uppercase shadow-brutal-sm ${
                    category === name ? "bg-accent-yellow text-ink" : "bg-card text-ink"
                  }`}
                >
                  {name} ({count})
                </button>
              ))}
            </div>
          </div>
        )}
        {notice && <p className="font-mono text-xs uppercase text-ink/50">{notice}</p>}
      </Card>

      {view === "lines" ? (
        displayedMarkets.length === 0 ? (
          <EmptyState icon="notebook" title="No lines on the board" hint="Refresh The Book or try a broader search." />
        ) : (
          <>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-ink/45">
                <PixelIcon name="bullseye-arrow" size={12} /> Tap any card to jump to its line
              </p>
              <div className="group overflow-hidden border-3 border-ink bg-paper shadow-brutal-sm">
                <div className="flex w-max animate-marquee gap-3 p-3 [animation-duration:52s] group-hover:[animation-play-state:paused]">
                  {[...spotlightCards, ...spotlightCards].map((card, i) => (
                    <button
                      key={`${card.key}:${i}`}
                      type="button"
                      onClick={() => focusMarket(card.market.id)}
                      className={`group/spot relative w-72 shrink-0 overflow-hidden border-3 border-ink p-3 text-left shadow-brutal-sm transition-transform duration-100 hover:-translate-y-0.5 hover:shadow-brutal ${
                        card.dark
                          ? "bg-ink text-white"
                          : card.yellow
                            ? "bg-accent-yellow text-ink"
                            : "bg-card text-ink"
                      }`}
                    >
                      <p className={`brutal-label !mb-1 flex items-center gap-1 ${card.dark ? "!text-white/65" : ""}`}>
                        <PixelIcon name={card.icon} size={13} /> {card.label}
                      </p>
                      <p className="line-clamp-2 font-display text-lg font-bold leading-tight">
                        {card.market.question}
                      </p>
                      <p className={`mt-2 font-mono text-[10px] uppercase ${card.dark ? "text-white/55" : "text-ink/55"}`}>
                        {card.detail}
                      </p>
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 bg-ink/90 font-display text-lg font-bold text-white opacity-0 transition-opacity duration-150 group-hover/spot:opacity-100">
                        <PixelIcon name="bullseye-arrow" size={16} /> Tap to bet
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <ul className="space-y-5">
              {displayedMarkets.map((market) => {
              const prices = parsePrices(market.outcomePrices);
              if (!prices) return null;
              const [yes, no] = prices;
              const color = categoryColor(market.category);
              const tier = oddsTier(yes, no);
              return (
                <li
                  key={market.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(market.id, el);
                    else cardRefs.current.delete(market.id);
                  }}
                  className={`scroll-mt-24 ${flashId === market.id ? "animate-flash" : ""}`}
                >
                  <Card className="overflow-hidden !p-0 transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-brutal-lg">
                    {/* Category-colored header band — the image lives here now as a
                        small thumbnail instead of dominating a 280px column. */}
                    <div
                      className="relative flex items-center gap-3 border-b-3 border-ink p-3"
                      style={{ backgroundImage: `linear-gradient(120deg, ${color} 0%, ${color} 48%, #F4F1EA 150%)` }}
                    >
                      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: STRIPES }} />
                      <MarketThumb src={market.image} category={market.category} />
                      <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <Badge className="bg-card text-ink">{market.category ?? "Polymarket"}</Badge>
                        <span
                          className={`inline-flex items-center gap-1 border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm ${tier.bg} ${tier.fg}`}
                        >
                          <PixelIcon name={tier.icon} size={11} /> {tier.label}
                        </span>
                        <span className="ml-auto font-mono text-[10px] font-bold uppercase text-ink/60">
                          closes {fmtDate(market.endDate)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 p-5">
                      <div>
                        <p className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                          {market.question}
                        </p>
                        {market.eventTitle && market.eventTitle !== market.question && (
                          <p className="mt-1 font-mono text-[10px] font-bold uppercase text-ink/45">
                            from {market.eventTitle}
                          </p>
                        )}
                        {market.description && (
                          <p className="mt-2 line-clamp-2 text-sm font-bold text-ink/55">
                            {market.description}
                          </p>
                        )}
                      </div>

                      {/* Probability bar — the headline visual. Yes/No split,
                          hatched, animating out from 50/50 on first paint. */}
                      <div className="relative flex h-8 w-full overflow-hidden border-3 border-ink shadow-brutal-sm">
                        <div
                          className="relative flex items-center justify-start overflow-hidden bg-accent-green transition-[width] duration-700 ease-out"
                          style={{ width: `${(mounted ? yes : 0.5) * 100}%` }}
                        >
                          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: STRIPES }} />
                          <span className="relative whitespace-nowrap px-2 font-mono text-[11px] font-bold uppercase text-ink">
                            Yes {oddsLabel(yes)}
                          </span>
                        </div>
                        <div
                          className="relative flex items-center justify-end overflow-hidden border-l-3 border-ink bg-accent-red transition-[width] duration-700 ease-out"
                          style={{ width: `${(mounted ? no : 0.5) * 100}%` }}
                        >
                          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: STRIPES }} />
                          <span className="relative whitespace-nowrap px-2 font-mono text-[11px] font-bold uppercase text-white">
                            No {oddsLabel(no)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className="bg-paper text-ink">24h {compactMoney(market.volume24hr)}</Badge>
                        <Badge className="bg-paper text-ink">vol {compactMoney(market.volume)}</Badge>
                        <Badge className="bg-paper text-ink">liq {compactMoney(market.liquidity)}</Badge>
                        {market.spread !== null && (
                          <Badge className="bg-paper text-ink">spread {Math.round(market.spread * 100)}%</Badge>
                        )}
                        {tagList(market.tags).map((tag) => (
                          <span key={tag} className="font-mono text-[10px] font-bold uppercase text-ink/40">
                            #{tag}
                          </span>
                        ))}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {([
                          ["Yes", yes, "bg-accent-green text-ink", "Take this side"],
                          ["No", no, "bg-accent-red text-white", "Fade it"],
                        ] as const).map(([outcome, price, cls, label]) => {
                          const favored = price === Math.max(yes, no) && yes !== no;
                          return (
                            <button
                              key={outcome}
                              onClick={() => openBet(market, outcome, price)}
                              disabled={busyKey !== null || coins < MIN_BET}
                              className={`group/bet brutal-press relative overflow-hidden border-3 border-ink p-4 text-left shadow-brutal disabled:opacity-50 ${cls}`}
                            >
                              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/30 opacity-0 transition-opacity group-hover/bet:opacity-100 group-hover/bet:animate-sheen" />
                              {favored && (
                                <span className="absolute right-2 top-2 flex items-center gap-0.5 border-2 border-ink bg-card px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-ink shadow-brutal-sm">
                                  <PixelIcon name="crown" size={9} /> favored
                                </span>
                              )}
                              <span className="relative block font-mono text-[10px] font-bold uppercase opacity-75">
                                {label}
                              </span>
                              <span className="relative block font-display text-4xl font-bold leading-none">
                                {outcome}
                              </span>
                              <span className="relative mt-2 block font-mono text-xs uppercase opacity-80">
                                odds {oddsLabel(price)}
                              </span>
                              <span className="relative mt-1 block font-display text-xl font-bold">
                                pays {payout(stake, price).toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="font-mono text-[10px] uppercase text-ink/35">
                        Payouts shown for your {stake.toLocaleString()}-coin unit · tap a side to set the exact amount.
                      </p>
                    </div>
                  </Card>
                </li>
              );
              })}
            </ul>
          </>
        )
      ) : null}

      {view === "open" ? (
        openBets.length === 0 ? (
          <EmptyState icon="notebook" title="No open slips" hint="Print a ticket from the Lines tab and it will land here." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {openBets.map((bet) => (
              <li key={bet.id} className="border-3 border-ink bg-paper p-4 shadow-brutal">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <StatusBadge status={bet.status} />
                  <p className="font-mono text-[10px] uppercase text-ink/45">
                    {new Date(bet.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </p>
                </div>
                <p className="font-display text-xl font-bold leading-tight">{bet.market.question}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="border-2 border-ink bg-card p-2">
                    <p className="brutal-label !mb-0">Side</p>
                    <p className="font-display text-lg font-bold">{bet.outcome}</p>
                  </div>
                  <div className="border-2 border-ink bg-card p-2">
                    <p className="brutal-label !mb-0">Stake</p>
                    <p className="font-display text-lg font-bold">{bet.stake}</p>
                  </div>
                  <div className="border-2 border-ink bg-card p-2">
                    <p className="brutal-label !mb-0">Pays</p>
                    <p className="font-display text-lg font-bold">{bet.potentialPayout}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {view === "settled" ? (
        resolvedBets.length === 0 ? (
          <EmptyState icon="trophy" title="No settled slips" hint="Reality is still thinking." />
        ) : (
          <ul className="space-y-3">
            {resolvedBets.map((bet) => (
              <li key={bet.id} className="grid gap-3 border-3 border-ink bg-card p-4 shadow-brutal-sm md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-center">
                <div>
                  <StatusBadge status={bet.status} />
                  <p className="mt-2 font-display text-2xl font-bold">
                    {bet.status === "won"
                      ? `+${(bet.potentialPayout - bet.stake).toLocaleString()}`
                      : bet.status === "lost"
                        ? `-${bet.stake}`
                        : "refund"}
                  </p>
                </div>
                <p className="font-bold leading-tight">{bet.market.question}</p>
                <p className="font-mono text-[10px] uppercase text-ink/45">
                  {bet.outcome} · stake {bet.stake}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {pending && (() => {
        const { market, outcome, price } = pending;
        const color = categoryColor(market.category);
        const cap = Math.min(MAX_BET, coins);
        const amount = clampStake(slipStake, cap);
        const win = payout(amount, price);
        const profit = win - amount;
        const sideGreen = outcome === "Yes";
        return (
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-ink/60 p-4"
            onClick={() => setPending(null)}
          >
            <div
              className="w-full max-w-md animate-pop-in border-3 border-ink bg-card shadow-brutal-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative flex items-center justify-between border-b-3 border-ink p-3"
                style={{ backgroundImage: `linear-gradient(120deg, ${color}, ${color} 55%, #F4F1EA 160%)` }}
              >
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: STRIPES }} />
                <p className="brutal-label !mb-0 relative flex items-center gap-1.5">
                  <PixelIcon name="notebook" size={14} /> Print a slip
                </p>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="brutal-press relative border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <p className="font-display text-xl font-bold leading-tight">{market.question}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`border-3 border-ink px-3 py-1 font-display text-lg font-bold shadow-brutal-sm ${
                        sideGreen ? "bg-accent-green text-ink" : "bg-accent-red text-white"
                      }`}
                    >
                      {outcome}
                    </span>
                    <span className="font-mono text-xs font-bold uppercase text-ink/55">odds {oddsLabel(price)}</span>
                  </div>
                </div>

                <div>
                  <p className="brutal-label">Stake</p>
                  <StakeEditor value={amount} onChange={setSlipStake} cap={cap} showMax />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border-2 border-ink bg-paper p-2">
                    <p className="brutal-label !mb-0">Risk</p>
                    <p className="font-display text-xl font-bold">{amount.toLocaleString()}</p>
                  </div>
                  <div className="border-2 border-ink bg-paper p-2">
                    <p className="brutal-label !mb-0">Pays</p>
                    <p className="font-display text-xl font-bold">{win.toLocaleString()}</p>
                  </div>
                  <div className="border-2 border-ink bg-accent-green p-2">
                    <p className="brutal-label !mb-0">Profit</p>
                    <p className="font-display text-xl font-bold">+{profit.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase text-ink/50">
                    balance after · {(coins - amount).toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant={sideGreen ? "green" : "danger"}
                      disabled={busyKey !== null || amount > coins}
                      onClick={submitBet}
                    >
                      {busyKey !== null ? "printing…" : `Bet ${amount.toLocaleString()}`}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
