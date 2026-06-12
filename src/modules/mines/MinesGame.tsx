"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst } from "@/lib/confetti";
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
  const isBusted = game.status === "busted";
  const isOver = isBusted || game.status === "cashed";
  const mineSet = new Set(game.mines ?? []);
  const revealedSet = new Set(game.revealed);

  return (
    <div
      className={`grid gap-1.5 ${isBusted ? "mines-board-bust" : ""}`}
      style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
    >
      {Array.from({ length: 25 }, (_, i) => {
        const isSafeRevealed = revealedSet.has(i);
        const isMine = isOver && mineSet.has(i);
        const isHidden = !isSafeRevealed && !isMine;
        const canClick = isActive && isHidden && !busy;

        if (isSafeRevealed) {
          return (
            <button
              key={i}
              disabled
              aria-label="Safe tile"
              className="mines-gem relative flex h-12 w-full items-center justify-center border-2 border-accent-frost text-xl"
            >
              <span className="mines-gem-glint" aria-hidden />
              💎
            </button>
          );
        }

        if (isMine) {
          return (
            <button
              key={i}
              disabled
              aria-label="Mine"
              className={`relative flex h-12 w-full items-center justify-center border-2 text-xl ${
                isBusted
                  ? "mines-boom border-accent-red bg-accent-red/30"
                  : "border-ink/30 bg-ink/10 opacity-80"
              }`}
            >
              {isBusted && <span className="mines-shockwave" aria-hidden />}
              💣
            </button>
          );
        }

        return (
          <button
            key={i}
            onClick={() => canClick && onReveal(i)}
            disabled={!canClick}
            aria-label={`Tile ${i}`}
            className={`mines-tile relative flex h-12 w-full items-center justify-center border-2 text-xl ${
              canClick
                ? "mines-tile-live cursor-pointer border-ink"
                : "border-ink/40 opacity-50"
            }`}
            style={{ animationDelay: `${((i * 7) % 25) * 0.12}s` }}
          >
            <span className="mines-tile-face" aria-hidden>
              ?
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Scoped keyframes/effects for the Mines board. */
const minesFx = `
@keyframes mines-shimmer {
  0%, 88%, 100% { background-position: -120% 0; }
  94% { background-position: 220% 0; }
}
@keyframes mines-gem-pop {
  0% { transform: scale(0.2) rotate(-12deg); opacity: 0; }
  60% { transform: scale(1.25) rotate(4deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes mines-glint {
  0%, 70%, 100% { opacity: 0; transform: scale(0.6); }
  82% { opacity: 1; transform: scale(1.2); }
}
@keyframes mines-boom-shake {
  0%, 100% { transform: scale(1) rotate(0deg); }
  20% { transform: scale(1.25) rotate(-6deg); }
  40% { transform: scale(1.15) rotate(5deg); }
  60% { transform: scale(1.2) rotate(-3deg); }
  80% { transform: scale(1.1) rotate(2deg); }
}
@keyframes mines-shockwave {
  0% { opacity: 0.9; transform: scale(0.3); }
  100% { opacity: 0; transform: scale(2.6); }
}
@keyframes mines-board-bust {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-4px, 2px); }
  40% { transform: translate(4px, -3px); }
  60% { transform: translate(-3px, -2px); }
  80% { transform: translate(3px, 2px); }
}
.mines-tile {
  background: linear-gradient(145deg, #fbf9f3, #e9e4d6);
  box-shadow: inset 0 -3px 0 rgba(26, 26, 26, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.7);
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.15s ease;
}
.mines-tile-face {
  font-family: var(--font-display, inherit);
  font-weight: 700;
  font-size: 0.85rem;
  color: rgba(26, 26, 26, 0.22);
}
.mines-tile-live {
  background-image:
    linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, 0.85) 50%, transparent 65%),
    linear-gradient(145deg, #fbf9f3, #e9e4d6);
  background-size: 250% 100%, 100% 100%;
  background-repeat: no-repeat;
  animation: mines-shimmer 5s linear infinite;
}
.mines-tile-live:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 5px 0 rgba(26, 26, 26, 0.8), 0 0 14px rgba(57, 192, 255, 0.5);
  background: linear-gradient(145deg, #e4f4ff, #c4e6fb);
}
.mines-tile-live:hover .mines-tile-face { color: rgba(26, 26, 26, 0.6); }
.mines-tile-live:active { transform: translateY(0) scale(0.96); }
.mines-gem {
  background: linear-gradient(145deg, #d9f1ff, #9fd8f7);
  box-shadow: 0 0 12px rgba(57, 192, 255, 0.55), inset 0 2px 0 rgba(255, 255, 255, 0.8);
  animation: mines-gem-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.mines-gem-glint {
  position: absolute;
  right: 4px;
  top: 2px;
  width: 10px;
  height: 10px;
  pointer-events: none;
  background: radial-gradient(circle, #ffffff 0%, rgba(255, 255, 255, 0) 70%);
  animation: mines-glint 2.4s ease-in-out infinite;
}
.mines-boom { animation: mines-boom-shake 0.5s ease-out both; }
.mines-shockwave {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 3px solid rgba(255, 77, 46, 0.8);
  border-radius: 9999px;
  animation: mines-shockwave 0.6s ease-out both;
}
.mines-board-bust { animation: mines-board-bust 0.45s ease-out both; }
`;

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
      if (res.game?.status === "cashed" && res.game.revealed.length > 0) confettiBurst();
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
  const canCashOut = isActive;

  const safeTotal = game ? 25 - game.mineCount : 0;
  const safeFound = game?.revealed.length ?? 0;

  return (
    <div className="space-y-4">
      <style>{minesFx}</style>
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

          {/* Streak bar — safe tiles found vs. total safe tiles */}
          {!isOver && (
            <div>
              <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase text-ink/50">
                <span>diamond streak</span>
                <span>
                  {safeFound} / {safeTotal} safe
                </span>
              </div>
              <div className="h-2.5 border-2 border-ink bg-paper">
                <div
                  className="h-full bg-gradient-to-r from-accent-frost to-accent-yellow transition-all duration-300"
                  style={{ width: `${safeTotal > 0 ? (safeFound / safeTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

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
                ? `BANKED +${netCoins} coins (${game.multiplier.toFixed(2)}×)`
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
              Cash out now to take your stake back, or reveal a tile to start climbing.
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
            <li>• Cash out before any reveal to refund, or after safe tiles to bank the multiplier.</li>
            <li>• Reveal every safe tile to auto-cash-out at the max multiplier.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
