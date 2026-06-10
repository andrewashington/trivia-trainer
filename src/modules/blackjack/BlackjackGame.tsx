"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import type { TableView } from "@/modules/blackjack/schema";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10" };

/** Client-side hand value, only for the running totals shown mid-reveal. */
function valueOf(cards: string[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = c[0];
    if (r === "A") {
      aces++;
      total += 11;
    } else if ("TJQK".includes(r)) total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function PlayingCard({
  code,
  hidden,
  deal,
  flip,
}: {
  code?: string;
  hidden?: boolean;
  deal?: boolean;
  flip?: boolean;
}) {
  const anim = flip ? "animate-flip-in" : deal ? "animate-deal-in" : "";
  if (hidden || !code) {
    return (
      <div
        className={`flex h-24 w-16 items-center justify-center border-3 border-ink bg-ink shadow-brutal-sm ${anim}`}
      >
        <span className="font-display text-2xl font-bold text-paper/70">◆</span>
      </div>
    );
  }
  const rank = RANK_LABEL[code[0]] ?? code[0];
  const suit = code[1];
  const red = suit === "H" || suit === "D";
  return (
    <div
      className={`relative flex h-24 w-16 flex-col items-center justify-center border-3 border-ink bg-card shadow-brutal-sm ${anim} ${
        red ? "text-accent-red" : "text-ink"
      }`}
    >
      <span className="absolute left-1 top-0.5 font-display text-sm font-bold">
        {rank}
      </span>
      <span className="text-3xl leading-none">{SUIT_GLYPH[suit]}</span>
      <span className="absolute bottom-0.5 right-1 rotate-180 font-display text-sm font-bold">
        {rank}
      </span>
    </div>
  );
}

const CHIPS = [5, 10, 25, 50, 100];
const CHIP_COLOR: Record<number, string> = {
  5: "bg-accent-red text-white",
  10: "bg-accent-blue text-white",
  25: "bg-accent-green text-ink",
  50: "bg-accent-yellow text-ink",
  100: "bg-ink text-paper",
};

function ResultBanner({ hand }: { hand: NonNullable<TableView["hand"]> }) {
  const net = hand.payout - hand.bet;
  const bust = valueOf(hand.player) > 21;
  const config: Record<string, { label: string; cls: string }> = {
    blackjack: { label: `BLACKJACK! +${net}`, cls: "bg-accent-yellow text-ink" },
    won: { label: `YOU WIN +${net}`, cls: "bg-accent-green text-ink" },
    push: { label: "PUSH — bet returned", cls: "bg-paper text-ink" },
    lost: {
      label: bust ? `BUST — you lose ${hand.bet}` : `HOUSE WINS −${hand.bet}`,
      cls: "bg-accent-red text-white",
    },
  };
  const c = config[hand.status];
  if (!c) return null;
  return (
    <div
      className={`animate-stamp-in border-3 border-ink px-4 py-2 text-center font-display text-xl font-bold shadow-brutal ${c.cls}`}
    >
      {c.label}
    </div>
  );
}

/** What's actually rendered on the felt — lags the server state during reveals. */
type Shown = {
  player: string[];
  dealer: string[];
  holeHidden: boolean;
  settled: boolean; // banner + controls only after the reveal finishes
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BlackjackGame() {
  const [table, setTable] = useState<TableView | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every new animation so a stale async timeline aborts itself.
  const animToken = useRef(0);

  const showInstantly = (t: TableView) => {
    setShown(
      t.hand
        ? {
            player: t.hand.player,
            dealer: t.hand.dealer,
            holeHidden: t.hand.holeHidden,
            settled: t.hand.status !== "active",
          }
        : null
    );
  };

  useEffect(() => {
    api<TableView>("/api/blackjack")
      .then((t) => {
        setTable(t);
        showInstantly(t); // resuming a session — no replay theatrics
      })
      .catch((e) => setError(e.message));
  }, []);

  /**
   * Animate from what's on the felt to the new server state:
   * fresh deals go out card-by-card; on settle the hole card flips,
   * then each dealer draw lands one at a time before the banner.
   */
  const animateTo = useCallback(
    async (next: TableView, prev: Shown | null) => {
      const token = ++animToken.current;
      const live = () => animToken.current === token;
      const hand = next.hand;
      if (!hand) {
        setShown(null);
        return;
      }

      const freshDeal = !prev || prev.settled || prev.player.length === 0;
      let player = freshDeal ? [] : [...prev.player];
      const upcard = hand.dealer[0];
      let dealerShown = freshDeal ? [] : [upcard];
      const paint = (holeHidden: boolean, settled = false) =>
        setShown({ player: [...player], dealer: [...dealerShown], holeHidden, settled });

      if (freshDeal) {
        // player, dealer up, player, hole — like a real pitch
        const order: Array<() => void> = [
          () => (player = [hand.player[0]]),
          () => (dealerShown = [upcard]),
          () => (player = hand.player.slice(0, 2)),
        ];
        for (const step of order) {
          if (!live()) return;
          step();
          paint(true);
          await sleep(320);
        }
      }

      // any new player cards (hit / double)
      while (player.length < hand.player.length) {
        if (!live()) return;
        player = hand.player.slice(0, player.length + 1);
        paint(true);
        await sleep(320);
      }

      if (hand.status === "active") {
        if (live()) paint(true);
        return;
      }

      // Settled. Player bust loses before the dealer acts — skip the reveal.
      const playerBust = valueOf(hand.player) > 21;
      if (!playerBust && hand.dealer.length > 1) {
        await sleep(450);
        if (!live()) return;
        dealerShown = hand.dealer.slice(0, 2); // hole card flips
        paint(false);
        // remaining dealer draws, one at a time
        while (dealerShown.length < hand.dealer.length) {
          await sleep(650);
          if (!live()) return;
          dealerShown = hand.dealer.slice(0, dealerShown.length + 1);
          paint(false);
        }
        await sleep(500);
      } else {
        // Bust: let the killer card sink in, then flip the hole card
        // so the full hand is on the table before the banner stamps.
        await sleep(900);
        if (!live()) return;
        dealerShown = hand.dealer;
        paint(false);
        await sleep(600);
      }
      if (!live()) return;
      paint(false, true);
    },
    []
  );

  const run = useCallback(
    async (fn: () => Promise<TableView>) => {
      setBusy(true);
      setError(null);
      try {
        const prev = shown;
        const next = await fn();
        setTable(next);
        await animateTo(next, prev);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [shown, animateTo]
  );

  const deal = (amount: number) =>
    run(() => api<TableView>("/api/blackjack", { method: "POST", body: { bet: amount } }));
  const act = (action: "hit" | "stand" | "double") =>
    run(() =>
      api<TableView>("/api/blackjack/action", {
        method: "POST",
        body: { handId: table!.hand!.id, action },
      })
    );

  if (!table) {
    return (
      <Card>
        <p className="font-mono text-sm text-ink/50">
          {error ?? "Shuffling the shoe…"}
        </p>
      </Card>
    );
  }

  const hand = table.hand;
  // "in play" = server says active OR we're still revealing the outcome
  const inPlay = !!hand && !!shown && (!shown.settled || hand.status === "active");
  const showBanner = !!hand && hand.status !== "active" && !!shown?.settled;
  const canAct = !!hand && hand.status === "active" && !busy;
  const maxBet = table.coins;
  const clampedBet = Math.max(1, Math.min(bet, Math.max(maxBet, 1)));
  const playerCards = shown?.player ?? [];
  const dealerCards = shown?.dealer ?? [];
  const dealerValue = dealerCards.length ? valueOf(dealerCards) : null;
  const playerValue = playerCards.length ? valueOf(playerCards) : null;

  return (
    <div className="space-y-4">
      <Card className="space-y-5 bg-accent-felt/15">
        {/* Dealer */}
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <p className="brutal-label">Dealer</p>
            {dealerValue !== null && (
              <span className="border-2 border-ink bg-paper px-1.5 font-mono text-xs font-bold">
                {dealerValue}
                {shown?.holeHidden ? " + ?" : ""}
              </span>
            )}
          </div>
          <div className="flex min-h-[6rem] flex-wrap gap-2">
            {shown ? (
              <>
                {dealerCards.map((c, i) => (
                  <PlayingCard
                    key={`${c}${i}`}
                    code={c}
                    deal={i === dealerCards.length - 1}
                    flip={i === 1 && !shown.holeHidden}
                  />
                ))}
                {shown.holeHidden && dealerCards.length > 0 && <PlayingCard hidden deal />}
              </>
            ) : (
              <p className="self-center font-mono text-sm text-ink/40">
                Place a bet to be dealt in.
              </p>
            )}
          </div>
        </div>

        {/* Player */}
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <p className="brutal-label">You</p>
            {playerValue !== null && (
              <span
                className={`border-2 border-ink px-1.5 font-mono text-xs font-bold ${
                  playerValue > 21 ? "bg-accent-red text-white" : "bg-paper"
                }`}
              >
                {playerValue}
                {playerValue > 21 ? " — BUST" : ""}
              </span>
            )}
            {hand?.doubled && (
              <span className="border-2 border-ink bg-accent-yellow px-1.5 font-mono text-xs font-bold">
                DOUBLED
              </span>
            )}
          </div>
          <div className="flex min-h-[6rem] flex-wrap gap-2">
            {playerCards.map((c, i) => (
              <PlayingCard key={`${c}${i}`} code={c} deal={i === playerCards.length - 1} />
            ))}
          </div>
        </div>

        {showBanner && <ResultBanner hand={hand!} />}

        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {/* Controls */}
        {inPlay ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act("hit")} disabled={!canAct}>
              Hit
            </Button>
            <Button onClick={() => act("stand")} disabled={!canAct}>
              Stand
            </Button>
            {hand!.player.length === 2 && table.coins >= hand!.bet && (
              <Button onClick={() => act("double")} disabled={!canAct}>
                Double ({hand!.bet})
              </Button>
            )}
            <span className="ml-auto self-center font-mono text-xs text-ink/50">
              bet {hand!.bet}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Chip rail */}
            <div className="flex flex-wrap items-center gap-2">
              {CHIPS.map((v) => (
                <button
                  key={v}
                  onClick={() => setBet(Math.min(clampedBet + v, Math.max(maxBet, 1)))}
                  disabled={busy || clampedBet >= maxBet}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border-3 border-ink font-display text-sm font-bold shadow-brutal-sm transition-transform enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 disabled:opacity-40 ${CHIP_COLOR[v]}`}
                  style={{
                    backgroundImage:
                      "repeating-conic-gradient(transparent 0 30deg, rgba(255,255,255,0.25) 30deg 60deg)",
                  }}
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => setBet(1)}
                disabled={busy}
                className="border-2 border-ink bg-paper px-2 py-1 font-mono text-xs uppercase shadow-brutal-sm disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={() => setBet(Math.max(maxBet, 1))}
                disabled={busy || maxBet < 1}
                className="border-2 border-ink bg-paper px-2 py-1 font-mono text-xs uppercase shadow-brutal-sm disabled:opacity-40"
              >
                All in
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => deal(clampedBet)} disabled={busy || maxBet < 1}>
                Deal — {clampedBet} coins
              </Button>
              {hand && hand.bet <= maxBet && hand.bet !== clampedBet && (
                <Button onClick={() => deal(hand.bet)} disabled={busy || maxBet < 1}>
                  Rebet {hand.bet}
                </Button>
              )}
              <span className="ml-auto font-mono text-xs text-ink/50">
                balance {table.coins}
              </span>
            </div>
          </div>
        )}

        {maxBet < 1 && !inPlay && (
          <p className="font-mono text-xs text-ink/50">
            You&apos;re broke. Go earn some coins and come back.
          </p>
        )}

        <p className="font-mono text-[10px] uppercase text-ink/35">
          Dealer stands on all 17s · blackjack pays 3:2 · no splits
        </p>
      </Card>

      {table.history.length > 0 && (
        <Card>
          <p className="brutal-label mb-3">Recent hands</p>
          <ul className="space-y-1">
            {table.history.map((h) => {
              const net = h.payout - h.bet;
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between border-2 border-ink bg-paper px-3 py-1.5 font-mono text-xs"
                >
                  <span className="uppercase">
                    {h.status === "blackjack" ? "Blackjack!" : h.status}
                  </span>
                  <span className="text-ink/50">bet {h.bet}</span>
                  <span
                    className={`font-bold ${
                      net > 0 ? "text-accent-forest" : net < 0 ? "text-accent-red" : "text-ink/50"
                    }`}
                  >
                    {net > 0 ? `+${net}` : net}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
