"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst } from "@/lib/confetti";
import { Button, Card } from "@/components/ui";
import { MIN_BET } from "@/modules/arcade/constants";
import { multiplierAt } from "@/modules/crash/curve";

type ActiveRound = {
  id: string;
  stake: number;
  startedAt: string;
};

type GetResponse =
  | { round: ActiveRound; serverNow: number; justBusted?: never }
  | { round: null; serverNow?: number; justBusted?: { crashPoint: number } };

type StartResponse = { id: string; stake: number; startedAt: string; serverNow: number };
type CashoutBusted = { busted: true; crashPoint: number; coins: number };
type CashoutWin = { busted: false; multiplier: number; winnings: number; net: number; coins: number };
type CashoutResponse = CashoutBusted | CashoutWin;
type Phase =
  | { tag: "idle" }
  | { tag: "live"; roundId: string; stake: number; startedAtMs: number }
  | { tag: "win"; multiplier: number; winnings: number; net: number; stake: number }
  | { tag: "bust"; crashPoint: number; stake: number };
type ChartPoint = { x: number; y: number };

const BET_PRESETS = [10, 25, 50, 100, 250];
const SERVER_CHECK_MS = 650;

function valueClass(multiplier: number): string {
  if (multiplier >= 10) return "text-accent-yellow";
  if (multiplier >= 5) return "text-accent-neon";
  if (multiplier >= 2) return "text-accent-green";
  return "text-accent-rocket";
}

function CrashChart({
  points,
  phase,
}: {
  points: ChartPoint[];
  phase: "idle" | "live" | "win" | "bust";
}) {
  const { path, dot, maxY } = useMemo(() => {
    const w = 320;
    const h = 128;
    if (points.length < 2) {
      return { path: "", dot: null as ChartPoint | null, maxY: 2 };
    }
    const x0 = points[0].x;
    const xMax = Math.max(1, points[points.length - 1].x - x0);
    const yMax = Math.max(2, ...points.map((p) => p.y));
    const mapped = points.map((p) => ({
      x: ((p.x - x0) / xMax) * w,
      y: h - ((p.y - 1) / (yMax - 1)) * (h - 16) - 8,
    }));
    return {
      path: mapped.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
      dot: mapped[mapped.length - 1],
      maxY: yMax,
    };
  }, [points]);

  const live = phase === "live";

  return (
    <div className="relative overflow-hidden border-3 border-ink bg-ink shadow-brutal-sm">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(#ffffff22_1px,transparent_1px),linear-gradient(90deg,#ffffff22_1px,transparent_1px)] [background-size:32px_32px]" />
      <svg viewBox="0 0 320 128" className="relative block h-36 w-full" aria-hidden>
        <path d="M 0 120 L 320 120" stroke="#F4F1EA" strokeOpacity="0.35" strokeWidth="2" />
        {path && (
          <>
            <path
              d={`${path} L 320 128 L 0 128 Z`}
              fill={phase === "bust" ? "#FF4D2E44" : "#FFD60A33"}
            />
            <path
              d={path}
              fill="none"
              stroke={phase === "bust" ? "#FF4D2E" : "#FFD60A"}
              strokeWidth="5"
              strokeLinecap="square"
              strokeLinejoin="round"
            />
          </>
        )}
        {dot && (
          <g className={live ? "animate-pulse" : ""}>
            <rect
              x={dot.x - 5}
              y={dot.y - 5}
              width="10"
              height="10"
              fill={phase === "bust" ? "#FF4D2E" : "#B6FF00"}
              stroke="#F4F1EA"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      <div className="absolute left-2 top-2 border-2 border-paper bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-paper">
        live curve
      </div>
      <div className="absolute bottom-2 right-2 border-2 border-paper bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-paper">
        top {maxY.toFixed(2)}x
      </div>
    </div>
  );
}

export function CrashGame({ initialCoins }: { initialCoins: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ tag: "idle" });
  const [bet, setBet] = useState(25);
  const [coins, setCoins] = useState(initialCoins);
  const [liveMultiplier, setLiveMultiplier] = useState(1);
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockOffsetRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const shownMultiplierAt = useCallback((startedAtMs: number) => {
    return multiplierAt(Date.now() + clockOffsetRef.current - startedAtMs);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (checkTimerRef.current) {
      clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
    }
  }, []);

  const settleBust = useCallback(
    (crashPoint: number, stake: number) => {
      stopLoop();
      setLiveMultiplier(crashPoint);
      setChartPoints((pts) => [...pts, { x: Date.now(), y: crashPoint }].slice(-80));
      setPhase({ tag: "bust", crashPoint, stake });
      router.refresh();
    },
    [router, stopLoop]
  );

  const checkServer = useCallback(async () => {
    const current = phaseRef.current;
    if (current.tag !== "live") return;
    try {
      const data = await api<GetResponse>("/api/crash");
      if (data.justBusted) {
        settleBust(data.justBusted.crashPoint, current.stake);
        return;
      }
    } catch {
      // A transient poll failure should not freeze the local multiplier.
    }
    if (phaseRef.current.tag === "live") {
      checkTimerRef.current = setTimeout(checkServer, SERVER_CHECK_MS);
    }
  }, [settleBust]);

  const startLoop = useCallback(
    (startedAtMs: number) => {
      stopLoop();
      const tick = () => {
        const current = phaseRef.current;
        if (current.tag !== "live") return;
        const m = shownMultiplierAt(startedAtMs);
        const now = Date.now();
        setLiveMultiplier(m);
        setChartPoints((pts) => [...pts, { x: now, y: m }].slice(-80));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      checkTimerRef.current = setTimeout(checkServer, SERVER_CHECK_MS);
    },
    [checkServer, shownMultiplierAt, stopLoop]
  );

  const beginLiveRound = useCallback(
    (round: ActiveRound, serverNow: number) => {
      clockOffsetRef.current = serverNow - Date.now();
      const startedAtMs = new Date(round.startedAt).getTime();
      const nextPhase: Phase = {
        tag: "live",
        roundId: round.id,
        stake: round.stake,
        startedAtMs,
      };
      phaseRef.current = nextPhase;
      setLiveMultiplier(1);
      setChartPoints([{ x: Date.now(), y: 1 }]);
      setPhase(nextPhase);
      startLoop(startedAtMs);
    },
    [startLoop]
  );

  useEffect(() => {
    api<GetResponse>("/api/crash")
      .then((data) => {
        if (data.justBusted) {
          settleBust(data.justBusted.crashPoint, 0);
        } else if (data.round) {
          beginLiveRound(data.round, data.serverNow);
        }
      })
      .catch((e: Error) => setError(e.message));
    return () => stopLoop();
  }, [beginLiveRound, settleBust, stopLoop]);

  const placeBet = useCallback(async () => {
    if (busy || phaseRef.current.tag === "live") return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<StartResponse>("/api/crash", {
        method: "POST",
        body: { bet },
      });
      beginLiveRound({ id: res.id, stake: res.stake, startedAt: res.startedAt }, res.serverNow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [beginLiveRound, bet, busy]);

  const cashout = useCallback(async () => {
    const current = phaseRef.current;
    if (current.tag !== "live") return;
    stopLoop();
    const shown = shownMultiplierAt(current.startedAtMs);
    setBusy(true);
    setError(null);
    try {
      const res = await api<CashoutResponse>("/api/crash/cashout", {
        method: "POST",
        body: { multiplier: shown },
      });
      setCoins(res.coins);
      if (res.busted) {
        settleBust(res.crashPoint, current.stake);
      } else {
        setLiveMultiplier(res.multiplier);
        setChartPoints((pts) => [...pts, { x: Date.now(), y: res.multiplier }].slice(-80));
        setPhase({
          tag: "win",
          multiplier: res.multiplier,
          winnings: res.winnings,
          net: res.net,
          stake: current.stake,
        });
        confettiBurst();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      if (phaseRef.current.tag === "live") startLoop(phaseRef.current.startedAtMs);
    } finally {
      setBusy(false);
    }
  }, [router, settleBust, shownMultiplierAt, startLoop, stopLoop]);

  const playAgain = useCallback(() => {
    stopLoop();
    setPhase({ tag: "idle" });
    setLiveMultiplier(1);
    setChartPoints([]);
    setError(null);
  }, [stopLoop]);

  const isLive = phase.tag === "live";
  const clampedBet = Math.max(MIN_BET, Math.min(bet, coins));
  const liveStake = phase.tag === "live" ? phase.stake : 0;
  const liveValue = Math.floor(liveStake * liveMultiplier);
  const liveProfit = liveValue - liveStake;
  const phaseKind = phase.tag === "live" || phase.tag === "win" || phase.tag === "bust" ? phase.tag : "idle";

  return (
    <div className="space-y-4">
      <Card className="space-y-5 overflow-hidden bg-accent-rocket/10">
        <CrashChart points={chartPoints} phase={phaseKind} />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-h-28">
            {phase.tag === "idle" && (
              <div className="flex h-full flex-col justify-center">
                <p className="font-display text-3xl font-bold uppercase">Ready to launch</p>
                <p className="font-mono text-sm text-ink/50">
                  Watch the chart climb. Cash before the server says it crashed.
                </p>
              </div>
            )}

            {phase.tag === "live" && (
              <div>
                <div
                  className={`font-display text-7xl font-bold tabular-nums leading-none drop-shadow-sm ${valueClass(liveMultiplier)}`}
                >
                  {liveMultiplier.toFixed(2)}x
                </div>
                <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs">
                  <span className="border-2 border-ink bg-paper px-2 py-1">
                    stake {phase.stake}
                  </span>
                  <span className="border-2 border-ink bg-accent-yellow px-2 py-1 font-bold">
                    value {liveValue}
                  </span>
                  <span className="border-2 border-ink bg-accent-green px-2 py-1 font-bold">
                    profit +{Math.max(0, liveProfit)}
                  </span>
                </div>
              </div>
            )}

            {phase.tag === "win" && (
              <div className="animate-pop-in">
                <div className="font-display text-6xl font-bold text-accent-green">
                  {phase.multiplier.toFixed(2)}x
                </div>
                <div className="mt-2 inline-block border-3 border-ink bg-accent-green px-4 py-2 font-display text-xl font-bold shadow-brutal">
                  CASHED OUT +{phase.net}
                </div>
                <p className="mt-2 font-mono text-sm text-ink/60">
                  {phase.winnings} coins returned on a {phase.stake} coin stake
                </p>
              </div>
            )}

            {phase.tag === "bust" && (
              <div className="animate-stamp-in">
                <div className="font-display text-6xl font-bold text-accent-red">
                  {phase.crashPoint.toFixed(2)}x
                </div>
                <div className="mt-2 inline-block border-3 border-ink bg-accent-red px-4 py-2 font-display text-xl font-bold text-white shadow-brutal">
                  CRASHED
                </div>
                {phase.stake > 0 && (
                  <p className="mt-2 font-mono text-sm text-ink/60">stake lost: {phase.stake}</p>
                )}
              </div>
            )}
          </div>

          {isLive && (
            <Button
              onClick={cashout}
              disabled={busy}
              className="w-full bg-accent-yellow py-5 text-2xl text-ink sm:w-40"
            >
              Cash Out
            </Button>
          )}
        </div>

        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {phase.tag === "win" || phase.tag === "bust" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={playAgain}>Play Again</Button>
            <span className="ml-auto font-mono text-xs text-ink/50">balance {coins}</span>
          </div>
        ) : !isLive ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {BET_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => setBet(v)}
                  className={`brutal-press border-2 border-ink px-3 py-1.5 font-mono text-sm font-bold shadow-brutal-sm ${
                    bet === v ? "bg-accent-rocket text-white" : "bg-paper text-ink"
                  }`}
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => setBet(coins)}
                disabled={coins < 1}
                className="brutal-press border-2 border-ink bg-paper px-2 py-1 font-mono text-xs uppercase shadow-brutal-sm disabled:opacity-40"
              >
                All in
              </button>
            </div>

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
                Launch — {clampedBet} coins
              </Button>
              <span className="ml-auto font-mono text-xs text-ink/50">balance {coins}</span>
            </div>

            {coins < MIN_BET && (
              <p className="font-mono text-xs text-ink/50">
                You&apos;re broke. Go earn some coins and come back.
              </p>
            )}
          </div>
        ) : null}

        <p className="font-mono text-[10px] uppercase text-ink/35">
          Cash out before the crash · tiny house edge · live server-checked curve
        </p>
      </Card>
    </div>
  );
}
