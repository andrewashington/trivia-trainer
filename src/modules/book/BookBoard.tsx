"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
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

  const spotlights = useMemo(() => {
    const priced = filtered
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
    return { hot, soon, moonshot };
  }, [filtered]);

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

  async function placeBet(market: MarketView, outcome: "Yes" | "No", price: number) {
    const amount = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(stake)));
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

      {lastSlip && (
        <div className="animate-pop-in border-3 border-ink bg-accent-yellow p-4 shadow-brutal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="notebook" size={14} /> Ticket printed
              </p>
              <p className="font-display text-xl font-bold">
                {lastSlip.outcome} for {lastSlip.stake} coins
              </p>
            </div>
            <p className="border-2 border-ink bg-card px-3 py-1 font-display text-xl font-bold shadow-brutal-sm">
              Pays {lastSlip.payout.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {([
            ["lines", "Lines", filtered.length],
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
            <div className="grid gap-3 md:grid-cols-[1fr_150px_150px_auto]">
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
              <Input
                type="number"
                min={MIN_BET}
                max={MAX_BET}
                step={1}
                value={stake}
                onChange={(e) => setStake(Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(e.target.value)))))}
                aria-label="Stake"
              />
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
        filtered.length === 0 ? (
          <EmptyState icon="notebook" title="No lines on the board" hint="Refresh The Book or try a broader search." />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {spotlights.hot && (
                <div className="border-3 border-ink bg-accent-yellow p-3 shadow-brutal-sm">
                  <p className="brutal-label !mb-1 flex items-center gap-1">
                    <PixelIcon name="fire" size={13} /> Hot ticket
                  </p>
                  <p className="line-clamp-2 font-display text-lg font-bold leading-tight">
                    {spotlights.hot.market.question}
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase text-ink/55">
                    24h {compactMoney(spotlights.hot.market.volume24hr)} · liq {compactMoney(spotlights.hot.market.liquidity)}
                  </p>
                </div>
              )}
              {spotlights.soon && (
                <div className="border-3 border-ink bg-card p-3 shadow-brutal-sm">
                  <p className="brutal-label !mb-1 flex items-center gap-1">
                    <PixelIcon name="clock" size={13} /> Closing bell
                  </p>
                  <p className="line-clamp-2 font-display text-lg font-bold leading-tight">
                    {spotlights.soon.market.question}
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase text-ink/55">
                    closes {fmtDate(spotlights.soon.market.endDate)}
                  </p>
                </div>
              )}
              {spotlights.moonshot && (
                <div className="border-3 border-ink bg-ink p-3 text-white shadow-brutal-sm">
                  <p className="brutal-label !mb-1 flex items-center gap-1 !text-white/65">
                    <PixelIcon name="sparkles" size={13} /> Moonshot
                  </p>
                  <p className="line-clamp-2 font-display text-lg font-bold leading-tight">
                    {spotlights.moonshot.side} · {spotlights.moonshot.market.question}
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase text-white/55">
                    odds {oddsLabel(spotlights.moonshot.price)} · pays {payout(stake, spotlights.moonshot.price).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <ul className="space-y-5">
              {filtered.map((market) => {
              const prices = parsePrices(market.outcomePrices);
              if (!prices) return null;
              const [yes, no] = prices;
              return (
                <li key={market.id}>
                  <Card className="overflow-hidden !p-0">
                    <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
                      {market.image && (
                        <div className="relative min-h-48 border-b-3 border-ink bg-ink md:border-b-0 md:border-r-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={market.image}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                          <Badge className="absolute bottom-3 left-3 bg-card text-ink">
                            {market.category ?? "Polymarket"}
                          </Badge>
                        </div>
                      )}
                      <div className="flex min-h-64 flex-col gap-5 p-5">
                        <div>
                          {!market.image && <Badge>{market.category ?? "Polymarket"}</Badge>}
                          <p className="mt-2 font-display text-2xl font-bold leading-tight sm:text-3xl">
                            {market.question}
                          </p>
                          {market.eventTitle && market.eventTitle !== market.question && (
                            <p className="mt-1 font-mono text-[10px] font-bold uppercase text-ink/45">
                              from {market.eventTitle}
                            </p>
                          )}
                          <p className="mt-2 font-mono text-[11px] uppercase text-ink/45">
                            closes {fmtDate(market.endDate)}
                          </p>
                          {market.description && (
                            <p className="mt-3 line-clamp-2 text-sm font-bold text-ink/60">
                              {market.description}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Badge className="bg-paper text-ink">24h {compactMoney(market.volume24hr)}</Badge>
                            <Badge className="bg-paper text-ink">vol {compactMoney(market.volume)}</Badge>
                            <Badge className="bg-paper text-ink">liq {compactMoney(market.liquidity)}</Badge>
                            {market.spread !== null && (
                              <Badge className="bg-paper text-ink">
                                spread {Math.round(market.spread * 100)}%
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {tagList(market.tags).map((tag) => (
                              <span key={tag} className="font-mono text-[10px] font-bold uppercase text-ink/45">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="mt-auto grid gap-3 sm:grid-cols-2">
                          {([
                            ["Yes", yes, "bg-accent-green text-ink", "Take this side"],
                            ["No", no, "bg-accent-red text-white", "Fade it"],
                          ] as const).map(([outcome, price, cls, label]) => (
                            <button
                              key={outcome}
                              onClick={() => placeBet(market, outcome, price)}
                              disabled={busyKey !== null || stake > coins}
                              className={`brutal-press border-3 border-ink p-4 text-left shadow-brutal disabled:opacity-50 ${cls}`}
                            >
                              <span className="block font-mono text-[10px] font-bold uppercase opacity-75">
                                {label}
                              </span>
                              <span className="block font-display text-4xl font-bold leading-none">
                                {outcome}
                              </span>
                              <span className="mt-2 block font-mono text-xs uppercase opacity-80">
                                odds {oddsLabel(price)}
                              </span>
                              <span className="mt-1 block font-display text-xl font-bold">
                                pays {payout(stake, price).toLocaleString()}
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="font-mono text-[10px] uppercase text-ink/35">
                          Current stake: {stake.toLocaleString()} coins. Odds lock when the slip prints.
                        </p>
                      </div>
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
    </div>
  );
}
