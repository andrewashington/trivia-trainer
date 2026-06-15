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
  image: string | null;
  outcomePrices: unknown;
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
  const [stake, setStake] = useState(Math.max(MIN_BET, 25));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSlip, setLastSlip] = useState<{ question: string; outcome: string; stake: number; payout: number } | null>(null);

  const openBets = bets.filter((b) => b.status === "open");
  const resolvedBets = bets.filter((b) => b.status !== "open").slice(0, 8);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => `${m.question} ${m.category ?? ""}`.toLowerCase().includes(q));
  }, [markets, query]);

  async function refresh() {
    setNotice("Checking the board...");
    try {
      const data = await api<{ markets: MarketView[]; bets: BetView[]; coins: number }>(
        `/api/book${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`
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
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The ticket window jammed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card className="bg-accent-book text-white">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="brutal-label !text-white/70">The internet has odds. You have coins.</p>
              <h2 className="font-display text-3xl font-bold leading-tight">Buy a tiny slice of fate.</h2>
            </div>
            <div className="border-2 border-ink bg-card px-3 py-2 text-ink shadow-brutal-sm">
              <p className="brutal-label !mb-0">Balance</p>
              <p className="font-display text-2xl font-bold">{coins.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {lastSlip && (
          <div className="animate-pop-in border-3 border-ink bg-accent-yellow p-3 shadow-brutal">
            <p className="brutal-label flex items-center gap-1.5">
              <PixelIcon name="notebook" size={14} /> Ticket printed
            </p>
            <p className="font-display text-lg font-bold">
              {lastSlip.outcome} for {lastSlip.stake} coins
            </p>
            <p className="text-sm">Pays {lastSlip.payout.toLocaleString()} if it hits. Keep the stub.</p>
          </div>
        )}

        <Card className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search politics, sports, crypto..."
            />
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
          {notice && <p className="font-mono text-xs uppercase text-ink/50">{notice}</p>}
        </Card>

        {filtered.length === 0 ? (
          <EmptyState icon="notebook" title="No lines on the board" hint="Refresh The Book or try a broader search." />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {filtered.map((market) => {
              const prices = parsePrices(market.outcomePrices);
              if (!prices) return null;
              const [yes, no] = prices;
              return (
                <li key={market.id}>
                  <Card className="flex h-full flex-col gap-3">
                    <div className="flex gap-3">
                      {market.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={market.image}
                          alt=""
                          className="h-16 w-16 shrink-0 border-2 border-ink object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold leading-tight">{market.question}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase text-ink/45">
                          {market.category ?? "Polymarket"} · closes {fmtDate(market.endDate)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-2">
                      {([
                        ["Yes", yes, "bg-accent-green text-ink"],
                        ["No", no, "bg-accent-red text-white"],
                      ] as const).map(([outcome, price, cls]) => (
                        <button
                          key={outcome}
                          onClick={() => placeBet(market, outcome, price)}
                          disabled={busyKey !== null || stake > coins}
                          className={`brutal-press border-3 border-ink p-3 text-left shadow-brutal-sm disabled:opacity-50 ${cls}`}
                        >
                          <span className="block font-display text-xl font-bold">Bet {outcome}</span>
                          <span className="block font-mono text-xs uppercase opacity-80">
                            {oddsLabel(price)} · pays {payout(stake, price).toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <p className="brutal-label flex items-center gap-1.5">
            <PixelIcon name="notebook" size={14} /> Open slips
          </p>
          {openBets.length === 0 ? (
            <p className="text-sm text-ink/55">Nothing riding yet. Suspiciously responsible.</p>
          ) : (
            <ul className="space-y-2">
              {openBets.map((bet) => (
                <li key={bet.id} className="border-2 border-ink bg-paper p-2 shadow-brutal-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold leading-tight">{bet.market.question}</p>
                    <StatusBadge status={bet.status} />
                  </div>
                  <p className="mt-2 font-mono text-[10px] uppercase text-ink/55">
                    {bet.outcome} · stake {bet.stake} · pays {bet.potentialPayout}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="brutal-label flex items-center gap-1.5">
            <PixelIcon name="trophy" size={14} /> Settled slips
          </p>
          {resolvedBets.length === 0 ? (
            <p className="text-sm text-ink/55">No settled stubs yet.</p>
          ) : (
            <ul className="space-y-2">
              {resolvedBets.map((bet) => (
                <li key={bet.id} className="border-2 border-ink bg-card p-2 shadow-brutal-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold">
                      {bet.status === "won" ? `+${(bet.potentialPayout - bet.stake).toLocaleString()}` : bet.status === "lost" ? `-${bet.stake}` : "refunded"}
                    </span>
                    <StatusBadge status={bet.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink/60">{bet.market.question}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}
