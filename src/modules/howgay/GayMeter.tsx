"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst, confettiCelebrate } from "@/lib/confetti";
import { bracketFor } from "@/modules/howgay/lib";

type Phase = "idle" | "spinning" | "revealed";

/**
 * The big button and the slot-machine reveal. The number itself comes
 * from the server (deterministic per day); the drama is purely local.
 * Re-pressing replays the animation but lands on the same reading.
 */
export function GayMeter({ initialPercent }: { initialPercent: number | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initialPercent != null ? "revealed" : "idle");
  const [display, setDisplay] = useState<number>(initialPercent ?? 0);
  const [finalPercent, setFinalPercent] = useState<number | null>(initialPercent);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function spinTo(target: number, wasNew: boolean) {
    setPhase("spinning");
    const start = Date.now();
    const SPIN_MS = 1700;

    const tick = () => {
      const t = (Date.now() - start) / SPIN_MS;
      if (t >= 1) {
        setDisplay(target);
        setFinalPercent(target);
        setPhase("revealed");
        if (target >= 90) confettiCelebrate();
        else confettiBurst();
        if (wasNew) router.refresh(); // pull the updated leaderboard
        return;
      }
      // Random flicker that converges on the target as the spin slows.
      const wobble = Math.round((1 - t) * 100);
      const guess = Math.random() * 101;
      setDisplay(
        Math.max(0, Math.min(100, Math.round(target * t + guess * (1 - t) + (Math.random() - 0.5) * (wobble / 4))))
      );
      // Ease out: ticks get slower as we approach the number.
      timer.current = setTimeout(tick, 40 + t * t * 220);
    };
    tick();
  }

  async function press() {
    if (phase === "spinning") return;
    setError(null);
    try {
      const res = await api<{ percent: number; alreadyChecked: boolean }>("/api/howgay", {
        method: "POST",
      });
      spinTo(res.percent, !res.alreadyChecked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The meter jammed. Try again.");
    }
  }

  const bracket = finalPercent != null ? bracketFor(finalPercent) : null;

  return (
    <div className="space-y-4 text-center">
      {/* The dial */}
      <div className="border-3 border-ink bg-card p-6 shadow-brutal">
        <p className="brutal-label mb-2">Today&apos;s reading</p>
        <div
          className={`font-display text-7xl font-bold tabular-nums ${
            phase === "spinning" ? "text-accent-fuchsia" : "text-ink"
          }`}
        >
          {phase === "idle" ? "??" : display}
          <span className="text-3xl">%</span>
        </div>

        {phase === "revealed" && bracket && (
          <div className="mt-3 animate-stamp-in">
            <p className="inline-block border-3 border-ink bg-accent-fuchsia px-3 py-1 font-display text-lg font-bold text-white shadow-brutal-sm">
              {bracket.label}
            </p>
            <p className="mt-3 font-mono text-xs leading-relaxed text-ink/60">{bracket.flavor}</p>
          </div>
        )}

        {phase === "idle" && (
          <p className="mt-3 font-mono text-xs text-ink/50">
            One reading per day. The meter does not negotiate.
          </p>
        )}
      </div>

      {/* The big satisfying button */}
      <button
        type="button"
        onClick={press}
        disabled={phase === "spinning"}
        className={`w-full border-3 border-ink bg-accent-fuchsia px-6 py-5 font-display text-2xl font-bold uppercase tracking-wide text-white shadow-brutal-lg transition-all active:translate-x-1 active:translate-y-1 active:shadow-brutal-pressed disabled:opacity-70 ${
          phase === "spinning" ? "animate-wiggle" : "hover:-translate-y-0.5"
        }`}
      >
        {phase === "idle" && "How gay am I today?"}
        {phase === "spinning" && "Consulting the meter…"}
        {phase === "revealed" && "Behold it again"}
      </button>

      {phase === "revealed" && (
        <p className="font-mono text-[11px] text-ink/40">
          Same number until midnight — pressing harder doesn&apos;t help.
        </p>
      )}
      {error && <p className="font-mono text-xs text-accent-red">{error}</p>}
    </div>
  );
}
