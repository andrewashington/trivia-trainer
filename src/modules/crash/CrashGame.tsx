"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import { MAX_MULTIPLIER, MIN_BET } from "@/modules/arcade/constants";
import { multiplierAt } from "@/modules/crash/curve";

/* ───────────── Types ───────────── */

type ActiveRound = {
  id: string;
  stake: number;
  startedAt: string; // ISO string from server
};

type GetResponse =
  | { round: ActiveRound; justBusted?: never }
  | { round: null; justBusted?: { crashPoint: number } };

type StartResponse = { id: string; stake: number; startedAt: string };

type CashoutBusted = { busted: true; crashPoint: number; coins: number };
type CashoutWin = {
  busted: false;
  multiplier: number;
  winnings: number;
  net: number;
  coins: number;
};
type CashoutResponse = CashoutBusted | CashoutWin;

/* ─────────── Phase machine ─────────── */
type Phase =
  | { tag: "idle" }
  | { tag: "live"; roundId: string; stake: number; startedAtMs: number }
  | { tag: "win"; multiplier: number; winnings: number; net: number }
  | { tag: "bust"; crashPoint: number; stake: number };

const BET_PRESETS = [10, 25, 50, 100, 250];

/* ───────────── Component ───────────── */
export function CrashGame({ initialCoins }: { initialCoins: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ tag: "idle" });
  const [bet, setBet] = useState(25);
  const [coins, setCoins] = useState(initialCoins);
  const [liveMultiplier, setLiveMultiplier] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // rAF loop ref
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  /* ── Animation loop ── */
  const startLoop = useCallback((startedAtMs: number) => {
    const tick = () => {
      const elapsed = Date.now() - startedAtMs;
      const m = multiplierAt(elapsed);
      setLiveMultiplier(m);

      // Safety: auto-cashout if we somehow reach MAX_MULTIPLIER
      if (m >= MAX_MULTIPLIER) {
        void cashout();
        return;
      }

      if (phaseRef.current.tag === "live") {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /* ── On mount: resume or clear ── */
  useEffect(() => {
    api<GetResponse>("/api/crash")
      .then((data) => {
        if (data.justBusted) {
          // Crashed while we were away — show bust state.
          setPhase({ tag: "bust", crashPoint: data.justBusted.crashPoint, stake: 0 });
        } else if (data.round) {
          // Resume an active round.
          const startedAtMs = new Date(data.round.startedAt).getTime();
          setPhase({ tag: "live", roundId: data.round.id, stake: data.round.stake, startedAtMs });
          startLoop(startedAtMs);
        }
      })
      .catch((e: Error) => setError(e.message));

    return () => stopLoop();
  }, [startLoop, stopLoop]);

  /* ── Place Bet ── */
  const placeBet = useCallback(async () => {
    if (busy || phase.tag === "live") return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<StartResponse>("/api/crash", {
        method: "POST",
        body: { bet },
      });
      const startedAtMs = new Date(res.startedAt).getTime();
      setLiveMultiplier(1.0);
      setPhase({ tag: "live", roundId: res.id, stake: res.stake, startedAtMs });
      startLoop(startedAtMs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [busy, phase.tag, bet, startLoop]);

  /* ── Cash Out ── */
  const cashout = useCallback(async () => {
    if (phaseRef.current.tag !== "live") return;
    stopLoop();
    const stakeAtCashout = phaseRef.current.stake;
    setBusy(true);
    setError(null);
    try {
      const res = await api<CashoutResponse>("/api/crash/cashout", { method: "POST" });
      setCoins(res.coins);
      if (res.busted) {
        setPhase({ tag: "bust", crashPoint: res.crashPoint, stake: stakeAtCashout });
        setLiveMultiplier(res.crashPoint);
      } else {
        setPhase({ tag: "win", multiplier: res.multiplier, winnings: res.winnings, net: res.net });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      // Resume the loop if cashout failed (round might still be live)
      if (phaseRef.current.tag === "live") {
        startLoop(phaseRef.current.startedAtMs);
      }
    } finally {
      setBusy(false);
    }
  }, [stopLoop, router, startLoop]);

  /* ── Play Again ── */
  const playAgain = useCallback(() => {
    setPhase({ tag: "idle" });
    setLiveMultiplier(1.0);
    setError(null);
  }, []);

  /* ─────────── Render ─────────── */
  const isLive = phase.tag === "live";
  const clampedBet = Math.max(MIN_BET, Math.min(bet, coins));

  return (
    <div className="space-y-4">
      {/* ── Main display card ── */}
      <Card className="space-y-5 bg-accent-rocket/10">
        {/* Multiplier display */}
        <div className="flex min-h-40 flex-col items-center justify-center gap-2">
          {phase.tag === "idle" && (
            <p className="font-mono text-lg text-ink/40">Place a bet to launch</p>
          )}

          {phase.tag === "live" && (
            <>
              <div className="text-center font-display text-7xl font-bold text-accent-rocket tabular-nums drop-shadow-sm">
                {liveMultiplier.toFixed(2)}×
              </div>
              <p className="font-mono text-sm text-ink/50">climbing — cash out now!</p>
            </>
          )}

          {phase.tag === "win" && (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="font-display text-5xl font-bold text-accent-forest">
                {phase.multiplier.toFixed(2)}×
              </div>
              <div className="border-3 border-ink bg-accent-green px-4 py-2 font-display text-xl font-bold shadow-brutal">
                CASHED OUT!
              </div>
              <p className="font-mono text-sm">
                +{phase.net} coins
                <span className="ml-2 text-ink/50">({phase.winnings} total)</span>
              </p>
            </div>
          )}

          {phase.tag === "bust" && (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-center font-display text-7xl font-bold text-accent-red tabular-nums">
                {liveMultiplier.toFixed(2)}×
              </div>
              <div className="border-3 border-ink bg-accent-red px-4 py-2 font-display text-xl font-bold text-white shadow-brutal">
                💥 CRASHED @ {phase.crashPoint.toFixed(2)}×
              </div>
              {phase.stake > 0 && (
                <p className="font-mono text-sm text-ink/70">−{phase.stake} coins</p>
              )}
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {/* Controls */}
        {isLive ? (
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={cashout}
              disabled={busy}
              className="w-full py-4 text-2xl"
              variant="yellow"
            >
              💰 Cash Out @ {liveMultiplier.toFixed(2)}×
            </Button>
            <p className="font-mono text-xs text-ink/50">
              stake: {(phase as { stake: number }).stake} coins
            </p>
          </div>
        ) : phase.tag === "win" || phase.tag === "bust" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={playAgain}>Play Again</Button>
            <span className="ml-auto font-mono text-xs text-ink/50">
              balance {coins}
            </span>
          </div>
        ) : (
          /* Idle — bet input */
          <div className="space-y-3">
            {/* Preset chips */}
            <div className="flex flex-wrap gap-2">
              {BET_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => setBet(v)}
                  className={`border-2 border-ink px-3 py-1.5 font-mono text-sm font-bold shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                    bet === v
                      ? "bg-accent-rocket text-white"
                      : "bg-paper text-ink"
                  }`}
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => setBet(coins)}
                disabled={coins < 1}
                className="border-2 border-ink bg-paper px-2 py-1 font-mono text-xs uppercase shadow-brutal-sm disabled:opacity-40"
              >
                All in
              </button>
            </div>

            {/* Manual input */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={bet}
                min={MIN_BET}
                max={coins}
                onChange={(e) => setBet(Math.max(MIN_BET, parseInt(e.target.value, 10) || MIN_BET))}
                className="brutal-input w-28"
              />
              <span className="font-mono text-xs text-ink/50">coins</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={placeBet}
                disabled={busy || clampedBet > coins || coins < MIN_BET}
                className="bg-accent-rocket text-white"
              >
                🚀 Launch — {clampedBet} coins
              </Button>
              <span className="ml-auto font-mono text-xs text-ink/50">
                balance {coins}
              </span>
            </div>

            {coins < MIN_BET && (
              <p className="font-mono text-xs text-ink/50">
                You&apos;re broke. Go earn some coins and come back.
              </p>
            )}
          </div>
        )}

        <p className="font-mono text-[10px] uppercase text-ink/35">
          Cash out before the crash · instant bust possible · house edge baked in
        </p>
      </Card>
    </div>
  );
}
