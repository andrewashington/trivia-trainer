"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import type { TableView } from "@/modules/blackjack/schema";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10" };

function PlayingCard({ code, hidden }: { code?: string; hidden?: boolean }) {
  if (hidden || !code) {
    return (
      <div className="flex h-20 w-14 items-center justify-center border-3 border-ink bg-ink shadow-brutal-sm">
        <span className="font-display text-xl font-bold text-paper">?</span>
      </div>
    );
  }
  const rank = RANK_LABEL[code[0]] ?? code[0];
  const suit = code[1];
  const red = suit === "H" || suit === "D";
  return (
    <div
      className={`flex h-20 w-14 flex-col items-center justify-center border-3 border-ink bg-card shadow-brutal-sm ${
        red ? "text-accent-red" : "text-ink"
      }`}
    >
      <span className="font-display text-xl font-bold leading-none">{rank}</span>
      <span className="text-2xl leading-none">{SUIT_GLYPH[suit]}</span>
    </div>
  );
}

function ResultBanner({ hand }: { hand: NonNullable<TableView["hand"]> }) {
  const net = hand.payout - hand.bet;
  const config: Record<string, { label: string; cls: string }> = {
    blackjack: { label: `BLACKJACK! +${net}`, cls: "bg-accent-yellow text-ink" },
    won: { label: `YOU WIN +${net}`, cls: "bg-accent-green text-ink" },
    push: { label: "PUSH — bet returned", cls: "bg-paper text-ink" },
    lost: { label: `HOUSE WINS −${hand.bet}`, cls: "bg-accent-red text-white" },
  };
  const c = config[hand.status];
  if (!c) return null;
  return (
    <div
      className={`animate-pop-in border-3 border-ink px-4 py-2 text-center font-display text-lg font-bold shadow-brutal ${c.cls}`}
    >
      {c.label}
    </div>
  );
}

export function BlackjackGame() {
  const [table, setTable] = useState<TableView | null>(null);
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TableView>("/api/blackjack")
      .then(setTable)
      .catch((e) => setError(e.message));
  }, []);

  const run = useCallback(async (fn: () => Promise<TableView>) => {
    setBusy(true);
    setError(null);
    try {
      setTable(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

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
  const active = hand?.status === "active";
  const maxBet = table.coins;
  const clampedBet = Math.max(1, Math.min(bet, Math.max(maxBet, 1)));

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        {/* Dealer */}
        <div>
          <p className="brutal-label mb-2">
            Dealer{hand && !hand.holeHidden ? ` · ${hand.dealerValue}` : ""}
          </p>
          <div className="flex min-h-[5rem] flex-wrap gap-2">
            {hand ? (
              <>
                {hand.dealer.map((c, i) => (
                  <PlayingCard key={`${c}${i}`} code={c} />
                ))}
                {hand.holeHidden && <PlayingCard hidden />}
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
          <p className="brutal-label mb-2">
            You{hand ? ` · ${hand.playerValue}` : ""}
            {hand?.doubled ? " · doubled" : ""}
          </p>
          <div className="flex min-h-[5rem] flex-wrap gap-2">
            {hand?.player.map((c, i) => <PlayingCard key={`${c}${i}`} code={c} />)}
          </div>
        </div>

        {hand && !active && <ResultBanner hand={hand} />}

        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {/* Controls */}
        {active ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act("hit")} disabled={busy}>
              Hit
            </Button>
            <Button onClick={() => act("stand")} disabled={busy}>
              Stand
            </Button>
            {hand!.player.length === 2 && table.coins >= hand!.bet && (
              <Button onClick={() => act("double")} disabled={busy}>
                Double ({hand!.bet})
              </Button>
            )}
            <span className="ml-auto self-center font-mono text-xs text-ink/50">
              bet {hand!.bet}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="brutal-label mb-1 block">Bet (1–{Math.max(maxBet, 1)})</span>
              <input
                type="number"
                min={1}
                max={Math.max(maxBet, 1)}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value) || 1)}
                className="w-28 border-3 border-ink bg-card px-3 py-2 font-mono text-sm shadow-brutal-sm focus:outline-none"
              />
            </label>
            <Button onClick={() => deal(clampedBet)} disabled={busy || maxBet < 1}>
              {hand ? "Deal again" : "Deal"}
            </Button>
            {hand && (
              <Button
                onClick={() => deal(Math.min(hand.bet > 0 ? hand.bet : 1, Math.max(maxBet, 1)))}
                disabled={busy || maxBet < 1}
              >
                Rebet {Math.min(hand.bet, Math.max(maxBet, 1))}
              </Button>
            )}
            <span className="ml-auto self-center font-mono text-xs text-ink/50">
              balance {table.coins}
            </span>
          </div>
        )}

        {maxBet < 1 && !active && (
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
