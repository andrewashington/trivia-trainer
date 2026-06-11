"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, Field, Input } from "@/components/ui";
import type { MinesView } from "@/modules/mines/schema";

type ApiResponse = { game: MinesView | null; coins?: number };

const MINE_COUNTS = [1, 3, 5, 10, 15, 20, 24] as const;

function TileGrid({
  game,
  onReveal,
  busy,
}: {
  game: MinesView;
  onReveal: (tile: number) => void;
  busy: boolean;
}) {
  const isActive = game.status === "active";
  const isOver = game.status === "busted" || game.status === "cashed";
  const mineSet = new Set(game.mines ?? []);
  const revealedSet = new Set(game.revealed);

  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
    >
      {Array.from({ length: 25 }, (_, i) => {
        const isSafeRevealed = revealedSet.has(i);
        const isMine = isOver && mineSet.has(i);
        const isHidden = !isSafeRevealed && !isMine;
        const canClick = isActive && isHidden && !busy;

        let content: string;
        let bgClass: string;

        if (isSafeRevealed) {
          content = "💎";
          bgClass = "bg-accent-frost/30 border-accent-frost";
        } else if (isMine) {
          content = "💣";
          bgClass =
            game.status === "busted"
              ? "bg-accent-red/30 border-accent-red"
              : "bg-ink/10 border-ink/30";
        } else {
          content = "";
          bgClass = canClick
            ? "bg-paper border-ink hover:bg-accent-frost/20 hover:border-accent-frost cursor-pointer"
            : "bg-paper border-ink/40 opacity-60";
        }

        return (
          <button
            key={i}
            onClick={() => canClick && onReveal(i)}
            disabled={!canClick}
            aria-label={
              isSafeRevealed
                ? "Safe tile"
                : isMine
                  ? "Mine"
                  : `Tile ${i}`
            }
            className={`flex h-12 w-full items-center justify-center border-2 text-xl transition-colors ${bgClass}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export function MinesGame({ initialCoins }: { initialCoins: number }) {
  const router = useRouter();
  const [game, setGame] = useState<MinesView | null>(null);
  const [coins, setCoins] = useState(initialCoins);
  const [bet, setBet] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // On mount: resume any active round
  useEffect(() => {
    api<ApiResponse>("/api/mines")
      .then((res) => {
        setGame(res.game);
        if (res.coins !== undefined) setCoins(res.coins);
        if (res.game) {
          setBet(res.game.stake);
          setMineCount(res.game.mineCount);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const run = useCallback(async (fn: () => Promise<ApiResponse>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setGame(res.game);
      if (res.coins !== undefined) setCoins(res.coins);
      if (res.game) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const startRound = () =>
    run(() =>
      api<ApiResponse>("/api/mines", {
        method: "POST",
        body: { bet, mineCount },
      })
    );

  const revealTile = (tile: number) =>
    run(() =>
      api<ApiResponse>("/api/mines/reveal", { method: "POST", body: { tile } })
    );

  const cashOut = () =>
    run(() => api<ApiResponse>("/api/mines/cashout", { method: "POST" }));

  const resetRound = () => {
    setGame(null);
    setError(null);
  };

  if (!loaded) {
    return (
      <Card>
        <p className="font-mono text-sm text-ink/50">Loading…</p>
      </Card>
    );
  }

  const isActive = game?.status === "active";
  const isBusted = game?.status === "busted";
  const isCashed = game?.status === "cashed";
  const isOver = isBusted || isCashed;

  // Net gain/loss for display after round ends
  const netCoins = game
    ? isBusted
      ? -game.stake
      : isCashed
        ? Math.floor(game.stake * game.multiplier) - game.stake
        : 0
    : 0;

  // Current banked payout shown on the Cash Out button
  const bankedPayout = game ? Math.floor(game.stake * game.multiplier) : 0;
  const canCashOut = isActive && (game?.revealed.length ?? 0) >= 1;

  return (
    <div className="space-y-4">
      {/* Multiplier display */}
      {game && (
        <Card className="space-y-3 bg-accent-frost/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="brutal-label text-xs">Current</p>
                <p className="font-display text-3xl font-bold">
                  {isActive && (game.revealed.length ?? 0) === 0
                    ? "—"
                    : `${game.multiplier.toFixed(2)}×`}
                </p>
              </div>
              {isActive && (
                <div className="text-center opacity-60">
                  <p className="brutal-label text-xs">Next tile</p>
                  <p className="font-display text-2xl font-bold text-accent-frost">
                    {game.nextMultiplier.toFixed(2)}×
                  </p>
                </div>
              )}
            </div>

            <div className="text-right">
              <p className="brutal-label text-xs">Stake</p>
              <p className="font-mono text-sm font-bold">{game.stake} coins</p>
            </div>
          </div>

          {/* Result banner */}
          {isOver && (
            <div
              className={`border-3 border-ink px-4 py-3 text-center font-display text-xl font-bold shadow-brutal ${
                isCashed
                  ? "bg-accent-frost text-ink"
                  : "bg-accent-red text-white"
              }`}
            >
              {isCashed
                ? `WIN +${netCoins} coins (${game.multiplier.toFixed(2)}×)`
                : `BOOM! −${game.stake} coins`}
            </div>
          )}
        </Card>
      )}

      {/* Grid */}
      {game ? (
        <Card className="space-y-4">
          <TileGrid game={game} onReveal={revealTile} busy={busy} />

          {error && (
            <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {isActive && (
              <Button
                onClick={cashOut}
                disabled={!canCashOut || busy}
                variant="yellow"
              >
                Cash Out — {bankedPayout} coins
              </Button>
            )}
            {isOver && (
              <Button onClick={resetRound} variant="ghost">
                Play Again
              </Button>
            )}
            <span className="ml-auto self-center font-mono text-xs text-ink/50">
              {coins} coins
            </span>
          </div>

          {isActive && (game.revealed.length ?? 0) === 0 && (
            <p className="font-mono text-xs text-ink/50">
              Reveal at least 1 tile to enable Cash Out.
            </p>
          )}
        </Card>
      ) : (
        /* Bet setup panel — shown when no active round */
        <Card className="space-y-4">
          <div className="space-y-3">
            <Field label="Bet (coins)">
              <Input
                type="number"
                min={1}
                max={Math.min(10000, coins)}
                value={bet}
                onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value))))}
                disabled={busy}
              />
            </Field>

            <div>
              <p className="brutal-label mb-2">Mines (1–24)</p>
              <div className="flex flex-wrap gap-2">
                {MINE_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setMineCount(n)}
                    disabled={busy}
                    className={`border-2 border-ink px-3 py-1.5 font-display font-bold shadow-brutal-sm transition-all disabled:opacity-50 ${
                      mineCount === n
                        ? "bg-accent-frost text-ink"
                        : "bg-paper text-ink hover:bg-accent-frost/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 font-mono text-xs text-ink/50">
                More mines = higher multiplier, more risk
              </p>
            </div>
          </div>

          {error && (
            <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={startRound}
              disabled={busy || coins < 1 || bet < 1}
            >
              Start — {bet} coins, {mineCount} mines
            </Button>
            <span className="ml-auto font-mono text-xs text-ink/50">
              {coins} coins
            </span>
          </div>

          {coins < 1 && (
            <p className="font-mono text-xs text-ink/50">
              You&apos;re out of coins. Go earn some and come back.
            </p>
          )}
        </Card>
      )}

      {!game && (
        <Card>
          <p className="brutal-label mb-2 text-xs">How to play</p>
          <ul className="space-y-1 font-mono text-xs text-ink/60">
            <li>• Reveal tiles one at a time — each safe tile raises the multiplier.</li>
            <li>• Hit a mine and the round ends: stake is lost.</li>
            <li>• Cash out after ≥1 safe reveal to bank stake × multiplier.</li>
            <li>• Reveal every safe tile to auto-cash-out at the max multiplier.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
