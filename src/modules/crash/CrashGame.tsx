"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst } from "@/lib/confetti";
import { Button, Card } from "@/components/ui";
import { MIN_BET, MAX_MULTIPLIER } from "@/modules/arcade/constants";
import { multiplierAt } from "@/modules/crash/curve";

type ActiveRound = {
  id: string;
  stake: number;
  startedAt: string;
};

type HistoryEntry = { crashPoint: number; cashedAt: number | null };

type GetResponse =
  | { round: ActiveRound; serverNow: number; justBusted?: never; history?: HistoryEntry[] }
  | { round: null; serverNow?: number; justBusted?: { crashPoint: number }; history?: HistoryEntry[] };

type StartResponse = { id: string; stake: number; startedAt: string; serverNow: number };
type CashoutBusted = { busted: true; crashPoint: number; coins: number };
type CashoutWin = {
  busted: false;
  multiplier: number;
  winnings: number;
  net: number;
  coins: number;
  crashPoint?: number;
};
type CashoutResponse = CashoutBusted | CashoutWin;

/**
 * Phases:
 *  - idle:   placing a bet
 *  - live:   round climbing, stake at risk, can cash out
 *  - cashed: player banked their winnings; the rocket keeps flying (purely
 *            visual, crashPoint already known + settled) so they can watch
 *            how high it *would* have gone. `done` flips when it finally
 *            hits the crash point.
 *  - bust:   let it ride and lost — settled at the crash point.
 */
type Phase =
  | { tag: "idle" }
  | { tag: "live"; roundId: string; stake: number; startedAtMs: number }
  | {
      tag: "cashed";
      stake: number;
      cashMultiplier: number;
      winnings: number;
      net: number;
      startedAtMs: number;
      crashPoint: number;
      done: boolean;
    }
  | { tag: "bust"; crashPoint: number; stake: number };
type ChartPoint = { x: number; y: number };

const BET_PRESETS = [10, 25, 50, 100, 250];
const SERVER_CHECK_MS = 650;
const SAMPLE_MS = 40; // throttle chart sampling (~25 pts/sec) regardless of frame rate
const MAX_POINTS = 600; // ~24s of climb kept on screen before the window scrolls

/**
 * Hype tiers — visuals escalate as the multiplier climbs.
 * 0: <2  calm · 1: ≥2 warm · 2: ≥5 hot · 3: ≥10 shaking
 * 4: ≥25 on fire · 5: ≥50 reality wobbles · 6: ≥100 NYAN MODE
 */
function tierFor(m: number): number {
  if (m >= 100) return 6;
  if (m >= 50) return 5;
  if (m >= 25) return 4;
  if (m >= 10) return 3;
  if (m >= 5) return 2;
  if (m >= 2) return 1;
  return 0;
}

const TIER_LABELS = ["", "warming up", "heating up", "🔥 ON FIRE", "🔥🔥 INFERNO", "⚡ UNREAL ⚡", "🌈 NYAN MODE 🌈"];

function valueClass(multiplier: number): string {
  if (multiplier >= 100) return "crash-rainbow-text";
  if (multiplier >= 10) return "text-accent-yellow";
  if (multiplier >= 5) return "text-accent-neon";
  if (multiplier >= 2) return "text-accent-green";
  return "text-accent-rocket";
}

function historyChipClass(h: HistoryEntry): string {
  if (h.crashPoint >= 10) return "bg-accent-yellow text-ink";
  if (h.crashPoint >= 2) return "bg-accent-green/80 text-ink";
  return "bg-accent-red/80 text-white";
}

function HistoryStrip({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <div>
      <p className="brutal-label mb-1.5 text-[10px]">Previous crashes</p>
      <div className="flex flex-wrap gap-1.5">
        {history.map((h, i) => (
          <span
            key={i}
            title={h.cashedAt !== null ? `you cashed at ${h.cashedAt.toFixed(2)}x` : "busted"}
            className={`relative border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm ${historyChipClass(h)} ${i === 0 ? "animate-pop-in" : ""}`}
          >
            {h.crashPoint.toFixed(2)}x
            {h.cashedAt !== null && (
              <span className="absolute -right-1.5 -top-1.5 text-[10px]" aria-label="cashed out">
                💰
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function NyanOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      <div className="crash-nyan-cat">
        <span className="crash-nyan-trail" />
        <span className="text-3xl">🐱</span>
      </div>
      <div className="crash-nyan-cat crash-nyan-cat-2">
        <span className="crash-nyan-trail" />
        <span className="text-2xl">🚀</span>
      </div>
      {["✦", "✧", "✦", "✧", "✦", "✧"].map((s, i) => (
        <span key={i} className={`crash-star crash-star-${i + 1}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

const W = 320;
const H = 128;
const REF_LEVELS = [1.5, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000];

type ChartPhase = "idle" | "live" | "cashed" | "bust";

function svgPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

/**
 * The live curve. Escalates with `tier`; once the player has cashed out the
 * curve splits at their cash multiplier — green "banked" territory below,
 * red "house" territory above — and a dashed line marks the crash point it's
 * climbing toward.
 */
function CrashChart({
  points,
  phase,
  done,
  tier,
  cashMult,
  crashTarget,
}: {
  points: ChartPoint[];
  phase: ChartPhase;
  done: boolean;
  tier: number;
  cashMult: number | null;
  crashTarget: number | null;
}) {
  const climbing = phase === "live" || (phase === "cashed" && !done);

  const geom = useMemo(() => {
    if (points.length < 2) {
      return { pre: "", post: "", preFill: "", dot: null as ChartPoint | null, star: null as ChartPoint | null, yMax: 2, refs: [] as { y: number; v: number }[] };
    }
    const x0 = points[0].x;
    const xMax = Math.max(1, points[points.length - 1].x - x0);
    const yMax = Math.max(2, crashTarget ?? 0, ...points.map((p) => p.y));
    const mapX = (x: number) => ((x - x0) / xMax) * W;
    const mapY = (v: number) => H - ((v - 1) / (yMax - 1)) * (H - 16) - 8;
    const mapped = points.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }));

    // Split the curve at the cash-out multiplier (curve is monotonic in y-value).
    let splitIdx = -1;
    if (cashMult != null) {
      splitIdx = points.findIndex((p) => p.y > cashMult);
    }
    let pre = mapped;
    let post: { x: number; y: number }[] = [];
    let star: ChartPoint | null = null;
    if (splitIdx > 0) {
      pre = mapped.slice(0, splitIdx);
      post = mapped.slice(splitIdx - 1); // overlap one point for a seamless join
      star = mapped[splitIdx - 1];
    }

    const refs = REF_LEVELS.filter((l) => l > 1 && l < yMax)
      .slice(-4)
      .map((v) => ({ v, y: mapY(v) }));

    const preFillPts = pre.length >= 2 ? pre : [];
    const preFill =
      preFillPts.length >= 2
        ? `${svgPath(preFillPts)} L ${preFillPts[preFillPts.length - 1].x.toFixed(1)} ${H} L ${preFillPts[0].x.toFixed(1)} ${H} Z`
        : "";

    return {
      pre: svgPath(pre),
      post: svgPath(post),
      preFill,
      dot: mapped[mapped.length - 1],
      star,
      yMax,
      refs,
      crashY: crashTarget != null ? mapY(crashTarget) : null,
    };
  }, [points, cashMult, crashTarget]);

  const nyan = climbing && tier >= 6;
  const busted = phase === "bust" || (phase === "cashed" && done);
  // Color of the "live" portion of the curve.
  const liveStroke = cashMult != null ? "#B6FF00" : busted ? "#FF4D2E" : nyan ? "url(#crash-rainbow)" : "#FFD60A";

  return (
    <div
      className={`relative overflow-hidden border-3 border-ink bg-ink shadow-brutal-sm ${
        climbing && tier >= 3 ? (tier >= 5 ? "crash-shake-hard" : "crash-shake") : ""
      } ${climbing && tier >= 4 ? "crash-fire-glow" : ""} ${busted ? "crash-flash" : ""}`}
    >
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(#ffffff22_1px,transparent_1px),linear-gradient(90deg,#ffffff22_1px,transparent_1px)] [background-size:32px_32px]" />
      {nyan && <NyanOverlay />}
      <svg viewBox={`0 0 ${W} ${H}`} className="relative block h-40 w-full" aria-hidden>
        <defs>
          <linearGradient id="crash-rainbow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF4D2E" />
            <stop offset="25%" stopColor="#FFD60A" />
            <stop offset="50%" stopColor="#B6FF00" />
            <stop offset="75%" stopColor="#39C0FF" />
            <stop offset="100%" stopColor="#C77DFF" />
          </linearGradient>
          <linearGradient id="crash-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD60A" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#FFD60A" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="crash-area-safe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B6FF00" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#B6FF00" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* reference multiplier gridlines */}
        {geom.refs.map((r) => (
          <g key={r.v}>
            <line x1="0" y1={r.y} x2={W} y2={r.y} stroke="#F4F1EA" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="2 4" />
            <text x="3" y={r.y - 2} fill="#F4F1EA" fillOpacity="0.35" fontSize="8" fontFamily="monospace">
              {r.v}x
            </text>
          </g>
        ))}

        <path d={`M 0 ${H - 8} L ${W} ${H - 8}`} stroke="#F4F1EA" strokeOpacity="0.3" strokeWidth="2" />

        {/* crash-point target line (visible while watching the post-cashout climb) */}
        {geom.crashY != null && crashTarget != null && (
          <g>
            <line x1="0" y1={geom.crashY} x2={W} y2={geom.crashY} stroke="#FF4D2E" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="6 4" />
            <text x={W - 4} y={geom.crashY - 3} fill="#FF4D2E" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="end">
              crash {crashTarget.toFixed(2)}x
            </text>
          </g>
        )}

        {/* filled area under the (banked, if cashed) portion of the curve */}
        {geom.preFill && (
          <path d={geom.preFill} fill={cashMult != null ? "url(#crash-area-safe)" : busted ? "#FF4D2E33" : "url(#crash-area)"} />
        )}

        {/* banked / live curve */}
        {geom.pre && (
          <path
            d={geom.pre}
            fill="none"
            stroke={liveStroke}
            strokeWidth={nyan ? 7 : cashMult != null ? 4 : 5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* post-cashout "house territory" — the part you let go of */}
        {geom.post && (
          <path
            d={geom.post}
            fill="none"
            stroke={busted ? "#FF4D2E" : nyan ? "url(#crash-rainbow)" : "#FF7A5C"}
            strokeWidth={nyan ? 7 : 5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={done ? undefined : "1 7"}
          />
        )}

        {/* cash-out marker */}
        {geom.star && (
          <g>
            <line x1="0" y1={geom.star.y} x2={W} y2={geom.star.y} stroke="#B6FF00" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 4" />
            <circle cx={geom.star.x} cy={geom.star.y} r="6" fill="#B6FF00" stroke="#0E0E0E" strokeWidth="2" />
            <text x={geom.star.x} y={geom.star.y + 3.5} fontSize="9" textAnchor="middle">💰</text>
          </g>
        )}

        {/* rocket / explosion at the leading edge */}
        {geom.dot && (
          <g className={climbing ? "crash-tip" : ""}>
            <text
              x={geom.dot.x}
              y={geom.dot.y + (busted ? 5 : 4)}
              fontSize={busted ? 18 : 16}
              textAnchor="middle"
            >
              {busted ? "💥" : tier >= 6 ? "🌈" : tier >= 4 ? "🔥" : "🚀"}
            </text>
          </g>
        )}
      </svg>

      <div className="absolute left-2 top-2 border-2 border-paper bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-paper">
        {phase === "cashed" && !done ? "watching…" : "live curve"}
      </div>
      <div className="absolute bottom-2 left-2 border-2 border-paper bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-paper/70">
        ceiling {MAX_MULTIPLIER.toLocaleString()}x
      </div>
      <div className="absolute bottom-2 right-2 border-2 border-paper bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-paper">
        top {geom.yMax.toFixed(2)}x
      </div>
      {climbing && tier >= 1 && (
        <div
          className={`absolute right-2 top-2 border-2 border-paper px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
            tier >= 6
              ? "crash-rainbow-bg text-ink"
              : tier >= 4
                ? "bg-accent-red text-white"
                : tier >= 2
                  ? "bg-accent-yellow text-ink"
                  : "bg-ink text-paper"
          } ${tier >= 3 ? "animate-pulse" : ""}`}
        >
          {TIER_LABELS[tier]}
        </div>
      )}
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockOffsetRef = useRef(0);
  const sampleRef = useRef(0);
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

  const pushPoint = useCallback((m: number) => {
    const now = Date.now();
    if (now - sampleRef.current < SAMPLE_MS) return;
    sampleRef.current = now;
    setChartPoints((pts) => [...pts, { x: now, y: m }].slice(-MAX_POINTS));
  }, []);

  const recordRound = useCallback((entry: HistoryEntry) => {
    setHistory((h) => [entry, ...h].slice(0, 12));
  }, []);

  const settleBust = useCallback(
    (crashPoint: number, stake: number, record = true) => {
      stopLoop();
      setLiveMultiplier(crashPoint);
      setChartPoints((pts) => [...pts, { x: Date.now(), y: crashPoint }].slice(-MAX_POINTS));
      setPhase({ tag: "bust", crashPoint, stake });
      if (record) recordRound({ crashPoint, cashedAt: null });
      router.refresh();
    },
    [recordRound, router, stopLoop]
  );

  // The rocket reached the (already-known) crash point during the
  // post-cashout watch. Freeze it and reveal how high it flew.
  const finishWatch = useCallback(
    (cur: Extract<Phase, { tag: "cashed" }>) => {
      stopLoop();
      setLiveMultiplier(cur.crashPoint);
      setChartPoints((pts) => [...pts, { x: Date.now(), y: cur.crashPoint }].slice(-MAX_POINTS));
      const next: Phase = { ...cur, done: true };
      phaseRef.current = next;
      setPhase(next);
      recordRound({ crashPoint: cur.crashPoint, cashedAt: cur.cashMultiplier });
    },
    [recordRound, stopLoop]
  );

  const checkServer = useCallback(async () => {
    if (phaseRef.current.tag !== "live") return;
    const stake = phaseRef.current.stake;
    try {
      const data = await api<GetResponse>("/api/crash");
      if (data.justBusted) {
        settleBust(data.justBusted.crashPoint, stake);
        return;
      }
    } catch {
      // A transient poll failure should not freeze the local multiplier.
    }
    if (phaseRef.current.tag === "live") {
      checkTimerRef.current = setTimeout(checkServer, SERVER_CHECK_MS);
    }
  }, [settleBust]);

  // One RAF driver for both the live climb and the post-cashout watch.
  const frame = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.tag === "live") {
      const m = shownMultiplierAt(cur.startedAtMs);
      setLiveMultiplier(m);
      pushPoint(m);
      rafRef.current = requestAnimationFrame(frame);
    } else if (cur.tag === "cashed" && !cur.done) {
      const m = shownMultiplierAt(cur.startedAtMs);
      if (m >= cur.crashPoint) {
        finishWatch(cur);
        return;
      }
      setLiveMultiplier(m);
      pushPoint(m);
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [finishWatch, pushPoint, shownMultiplierAt]);

  const startLoop = useCallback(() => {
    stopLoop();
    rafRef.current = requestAnimationFrame(frame);
    checkTimerRef.current = setTimeout(checkServer, SERVER_CHECK_MS);
  }, [checkServer, frame, stopLoop]);

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
      sampleRef.current = 0;
      setLiveMultiplier(1);
      setChartPoints([{ x: Date.now(), y: 1 }]);
      setPhase(nextPhase);
      startLoop();
    },
    [startLoop]
  );

  useEffect(() => {
    api<GetResponse>("/api/crash")
      .then((data) => {
        if (data.history) setHistory(data.history);
        if (data.justBusted) {
          // Server history already includes this round — don't re-record.
          settleBust(data.justBusted.crashPoint, 0, false);
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
        const crashPoint = res.crashPoint ?? res.multiplier;
        setLiveMultiplier(res.multiplier);
        setChartPoints((pts) => [...pts, { x: Date.now(), y: res.multiplier }].slice(-MAX_POINTS));
        const cashedPhase: Phase = {
          tag: "cashed",
          stake: current.stake,
          cashMultiplier: res.multiplier,
          winnings: res.winnings,
          net: res.net,
          startedAtMs: current.startedAtMs,
          crashPoint,
          done: crashPoint <= res.multiplier,
        };
        phaseRef.current = cashedPhase;
        setPhase(cashedPhase);
        confettiBurst();
        router.refresh();
        if (cashedPhase.done) {
          recordRound({ crashPoint, cashedAt: res.multiplier });
        } else {
          // Keep flying so the player can see how high it would have gone.
          rafRef.current = requestAnimationFrame(frame);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      if (phaseRef.current.tag === "live") startLoop();
    } finally {
      setBusy(false);
    }
  }, [frame, recordRound, router, settleBust, shownMultiplierAt, startLoop, stopLoop]);

  const skipWatch = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.tag === "cashed" && !cur.done) finishWatch(cur);
  }, [finishWatch]);

  const playAgain = useCallback(() => {
    stopLoop();
    setPhase({ tag: "idle" });
    setLiveMultiplier(1);
    setChartPoints([]);
    setError(null);
  }, [stopLoop]);

  const isLive = phase.tag === "live";
  const watching = phase.tag === "cashed" && !phase.done;
  const clampedBet = Math.max(MIN_BET, Math.min(bet, coins));
  const liveStake = phase.tag === "live" ? phase.stake : 0;
  const liveValue = Math.floor(liveStake * liveMultiplier);
  const liveProfit = liveValue - liveStake;

  const chartPhase: ChartPhase = phase.tag === "live" ? "live" : phase.tag === "cashed" ? "cashed" : phase.tag === "bust" ? "bust" : "idle";
  const cashMult = phase.tag === "cashed" ? phase.cashMultiplier : null;
  const crashTarget = phase.tag === "cashed" && !phase.done ? phase.crashPoint : null;
  const climbing = isLive || watching;
  const tier = climbing ? tierFor(liveMultiplier) : 0;

  return (
    <div className="space-y-4">
      <style>{crashFx}</style>
      <Card
        className={`space-y-5 overflow-hidden bg-accent-rocket/10 ${
          climbing && tier >= 6 ? "crash-nyan-card" : ""
        }`}
      >
        <CrashChart
          points={chartPoints}
          phase={chartPhase}
          done={phase.tag === "cashed" ? phase.done : false}
          tier={tier}
          cashMult={cashMult}
          crashTarget={crashTarget}
        />

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
                  className={`font-display text-7xl font-bold tabular-nums leading-none drop-shadow-sm ${valueClass(liveMultiplier)} ${
                    tier >= 5 ? "crash-shake-hard" : tier >= 2 ? "crash-throb" : ""
                  }`}
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

            {phase.tag === "cashed" && (
              <div className="animate-pop-in">
                {/* Locked-in winnings — banked the moment they cashed. */}
                <div className="mb-2 inline-block border-3 border-ink bg-accent-green px-4 py-2 font-display text-xl font-bold shadow-brutal">
                  CASHED @ {phase.cashMultiplier.toFixed(2)}x · +{phase.net}
                </div>

                {!phase.done ? (
                  // Still flying — ghost multiplier shows what it would be worth now.
                  <div>
                    <div className={`font-display text-6xl font-bold tabular-nums leading-none opacity-60 ${valueClass(liveMultiplier)}`}>
                      {liveMultiplier.toFixed(2)}x
                    </div>
                    <p className="mt-1 font-mono text-xs text-ink/50">
                      if you&apos;d held: {Math.floor(phase.stake * liveMultiplier)} coins · still climbing…
                    </p>
                  </div>
                ) : (
                  // The watch is over — reveal the crash and the road not taken.
                  <div>
                    <div className="font-display text-5xl font-bold text-accent-red">
                      💥 {phase.crashPoint.toFixed(2)}x
                    </div>
                    <p className="mt-2 font-mono text-sm text-ink/60">
                      {phase.crashPoint >= phase.cashMultiplier * 2
                        ? `It mooned. Holding to the top would've paid ${Math.floor(
                            phase.stake * phase.crashPoint
                          )} — you left ${Math.floor(phase.stake * phase.crashPoint) - phase.winnings} on the table.`
                        : `Smart bail — it only reached ${phase.crashPoint.toFixed(2)}x. You banked ${phase.winnings}.`}
                    </p>
                  </div>
                )}
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
              className={`w-full py-5 text-2xl text-ink sm:w-40 ${
                tier >= 6 ? "crash-rainbow-bg" : "bg-accent-yellow"
              }`}
            >
              Cash Out
            </Button>
          )}

          {watching && (
            <Button
              onClick={skipWatch}
              className="w-full py-5 text-lg sm:w-40 bg-paper text-ink"
            >
              Skip ▸
            </Button>
          )}
        </div>

        {error && (
          <p className="border-3 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {(phase.tag === "bust" || (phase.tag === "cashed" && phase.done)) ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={playAgain}>Play Again</Button>
            <span className="ml-auto font-mono text-xs text-ink/50">balance {coins}</span>
          </div>
        ) : !climbing ? (
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

        <HistoryStrip history={history} />

        <p className="font-mono text-[10px] uppercase text-ink/35">
          Cash out before the crash · tiny house edge · floor 1.00x · ceiling{" "}
          {MAX_MULTIPLIER.toLocaleString()}x · bail early to watch how high it would&apos;ve flown
        </p>
      </Card>
    </div>
  );
}

/** Scoped keyframes/effects for Crash's escalation tiers + nyan mode. */
const crashFx = `
@keyframes crash-shake {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 1px); }
  50% { transform: translate(1px, -1px); }
  75% { transform: translate(-1px, -1px); }
}
@keyframes crash-shake-hard {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20% { transform: translate(-2px, 2px) rotate(-0.4deg); }
  40% { transform: translate(2px, -2px) rotate(0.4deg); }
  60% { transform: translate(-2px, -1px) rotate(-0.3deg); }
  80% { transform: translate(2px, 1px) rotate(0.3deg); }
}
@keyframes crash-throb {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}
@keyframes crash-rainbow-shift {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes crash-nyan-fly {
  0% { left: -15%; top: 70%; }
  100% { left: 110%; top: 8%; }
}
@keyframes crash-star-twinkle {
  0%, 100% { opacity: 0.15; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.3); }
}
@keyframes crash-flash-kf {
  0% { box-shadow: inset 0 0 0 9999px rgba(255, 77, 46, 0.55); }
  100% { box-shadow: inset 0 0 0 9999px rgba(255, 77, 46, 0); }
}
@keyframes crash-tip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.crash-shake { animation: crash-shake 0.18s linear infinite; }
.crash-shake-hard { animation: crash-shake-hard 0.14s linear infinite; }
.crash-throb { animation: crash-throb 0.5s ease-in-out infinite; }
.crash-fire-glow { box-shadow: 0 0 24px 4px rgba(255, 77, 46, 0.55); }
.crash-flash { animation: crash-flash-kf 0.5s ease-out 1; }
.crash-tip { animation: crash-tip-pulse 0.7s ease-in-out infinite; }
.crash-rainbow-text {
  background: linear-gradient(90deg, #ff4d2e, #ffd60a, #b6ff00, #39c0ff, #c77dff, #ff4d2e);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: crash-rainbow-shift 1.2s linear infinite;
}
.crash-rainbow-bg {
  background: linear-gradient(90deg, #ff4d2e, #ffd60a, #b6ff00, #39c0ff, #c77dff, #ff4d2e);
  background-size: 200% 100%;
  animation: crash-rainbow-shift 1.2s linear infinite;
}
.crash-nyan-card { box-shadow: 0 0 32px 6px rgba(199, 125, 255, 0.6); }
.crash-nyan-cat {
  position: absolute;
  display: flex;
  align-items: center;
  animation: crash-nyan-fly 2.6s linear infinite;
}
.crash-nyan-cat-2 { animation-duration: 3.4s; animation-delay: 1.1s; }
.crash-nyan-trail {
  width: 64px;
  height: 10px;
  margin-right: -4px;
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    #ff4d2e 0 20%, #ffd60a 20% 40%, #b6ff00 40% 60%, #39c0ff 60% 80%, #c77dff 80% 100%
  );
  opacity: 0.9;
}
.crash-star {
  position: absolute;
  color: #f4f1ea;
  font-size: 12px;
  animation: crash-star-twinkle 1.4s ease-in-out infinite;
}
.crash-star-1 { left: 12%; top: 22%; }
.crash-star-2 { left: 32%; top: 64%; animation-delay: 0.3s; }
.crash-star-3 { left: 52%; top: 18%; animation-delay: 0.6s; }
.crash-star-4 { left: 68%; top: 55%; animation-delay: 0.2s; }
.crash-star-5 { left: 84%; top: 30%; animation-delay: 0.8s; }
.crash-star-6 { left: 22%; top: 42%; animation-delay: 1s; }
`;
