"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst } from "@/lib/confetti";
import { Button, Card, Field, Input } from "@/components/ui";
import { HOUSE_EDGE, MIN_BET, MAX_BET, MAX_MULTIPLIER } from "@/modules/arcade/constants";

type RoundResult = {
  roll: number;
  win: boolean;
  target: number;
  winnings: number;
  net: number;
  coins: number;
};

export function LimboGame({ initialCoins }: { initialCoins: number }) {
  const router = useRouter();
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2.0);
  const [coins, setCoins] = useState(initialCoins);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [displayRoll, setDisplayRoll] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const animRef = useRef<number | null>(null);

  const clampedTarget = Math.max(1.01, Math.min(MAX_MULTIPLIER, target));
  const winChance = (1 / clampedTarget) * 100;
  const potentialPayout = Math.floor(bet * clampedTarget * (1 - HOUSE_EDGE));

  const animateRoll = useCallback((finalRoll: number, onDone: () => void) => {
    const startTime = performance.now();
    const duration = 700;
    const startVal = 1.0;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out: slow down toward the end
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (finalRoll - startVal) * eased;
      setDisplayRoll(Math.round(current * 100) / 100);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayRoll(finalRoll);
        onDone();
      }
    }

    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDisplayRoll(null);
    setSettled(false);

    try {
      const data = await api<RoundResult>("/api/limbo", {
        method: "POST",
        body: { bet, target: clampedTarget },
      });

      setResult(data);
      setCoins(data.coins);

      animateRoll(data.roll, () => {
        setSettled(true);
        if (data.win) confettiBurst();
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [busy, bet, clampedTarget, animateRoll, router]);

  const canPlay = !busy && bet >= MIN_BET && bet <= coins;

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        {/* Roll display */}
        <div className="relative flex min-h-[8rem] flex-col items-center justify-center overflow-hidden border-3 border-ink bg-ink py-4">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(90deg,#B6FF00_2px,transparent_2px),linear-gradient(#B6FF00_2px,transparent_2px)] [background-size:28px_28px]" />
          {displayRoll !== null ? (
            <span
              className={`relative font-display text-6xl font-bold tabular-nums ${
                settled && result
                  ? result.win
                    ? "text-accent-neon"
                    : "text-accent-red"
                  : "text-accent-neon/70"
              }`}
            >
              {displayRoll.toFixed(2)}×
            </span>
          ) : (
            <span className="relative font-display text-2xl font-bold text-paper/30">—.——×</span>
          )}
          {settled && result && (
            <span
              className={`relative mt-2 animate-stamp-in border-2 border-ink px-3 py-1 font-display text-lg font-bold uppercase tracking-widest ${
                result.win ? "bg-accent-neon text-ink" : "bg-accent-red text-white"
              }`}
            >
              {result.win ? `WIN +${result.winnings}` : `MISS −${Math.abs(result.net)}`}
            </span>
          )}
        </div>

        {/* Bet input */}
        <Field label="Bet">
          <Input
            type="number"
            min={MIN_BET}
            max={MAX_BET}
            step={1}
            value={bet}
            onChange={(e) => setBet(Math.max(1, Math.round(Number(e.target.value))))}
            disabled={busy}
          />
        </Field>

        {/* Target input */}
        <Field label="Target multiplier">
          <Input
            type="number"
            min={1.01}
            max={MAX_MULTIPLIER}
            step={0.01}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            disabled={busy}
          />
        </Field>

        {/* Live stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border-2 border-ink bg-paper p-3 text-center">
            <p className="brutal-label text-[10px]">Win Chance</p>
            <p className="font-display text-xl font-bold">{winChance.toFixed(2)}%</p>
          </div>
          <div className="border-2 border-ink bg-paper p-3 text-center">
            <p className="brutal-label text-[10px]">Payout if Win</p>
            <p className="font-display text-xl font-bold">{potentialPayout}</p>
          </div>
        </div>

        <div className="h-4 border-2 border-ink bg-paper">
          <div
            className="h-full bg-accent-neon transition-[width] duration-200"
            style={{ width: `${Math.max(2, Math.min(100, winChance))}%` }}
          />
        </div>

        {/* Play button */}
        <Button
          onClick={play}
          disabled={!canPlay}
          className="w-full bg-accent-neon text-ink"
        >
          {busy ? "Rolling…" : `Play — ${bet} coins`}
        </Button>

        {!canPlay && !busy && bet > coins && (
          <p className="font-mono text-xs text-accent-red">Not enough coins for that bet.</p>
        )}

        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {/* Balance */}
        <p className="text-right font-mono text-xs text-ink/50">balance {coins}</p>

        <p className="font-mono text-[10px] uppercase text-ink/35">
          Win if roll ≥ target · house edge {(HOUSE_EDGE * 100).toFixed(0)}%
        </p>
      </Card>
    </div>
  );
}
