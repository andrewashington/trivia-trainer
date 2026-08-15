"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { confettiCelebrate } from "@/lib/confetti";
import { playSfx } from "@/lib/sfx";
import type { PlanDoc } from "@/modules/fitness/schema";
import type { LogResult } from "@/modules/fitness/service";

/**
 * Workout Mode — the cook-along screen, re-nouned for iron (the home-plus
 * RecipeMode lineage): pick a day, then ONE LIFT PER SCREEN with set pips
 * and a rest timer, a wake lock so the phone survives being propped on a
 * bench, and a confetti finale that logs the session (coins ride the same
 * event as every other check-in).
 */

type Phase = { kind: "pick" } | { kind: "run"; day: number; ex: number } | { kind: "done"; day: number };

type FlatExercise = PlanDoc["days"][number]["blocks"][number]["exercises"][number] & {
  blockLabel: string | null;
};

function flatten(day: PlanDoc["days"][number]): FlatExercise[] {
  return day.blocks.flatMap((b) => b.exercises.map((ex) => ({ ...ex, blockLabel: b.label ?? null })));
}

/** "90s" → 90 · "2-3 min" → 120 · "1:30" → 90 · bare small numbers read as minutes. */
function restSeconds(rest: string | null | undefined): number {
  if (!rest) return 90;
  const mmss = rest.match(/(\d+):(\d{2})/);
  if (mmss) return +mmss[1] * 60 + +mmss[2];
  const num = rest.match(/(\d+(?:\.\d+)?)/);
  if (!num) return 90;
  const n = parseFloat(num[1]);
  if (/m/i.test(rest)) return Math.round(n * 60);
  return n >= 20 ? Math.round(n) : Math.round(n * 60);
}

export function WorkoutMode({ planId, title, doc }: { planId: string; title: string; doc: PlanDoc }) {
  const [phase, setPhase] = useState<Phase>(
    doc.days.length === 1 ? { kind: "run", day: 0, ex: 0 } : { kind: "pick" }
  );
  const [setsDone, setSetsDone] = useState(0);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [result, setResult] = useState<LogResult | null>(null);
  const logged = useRef(false);

  // Keep the screen alive mid-set; re-grab the lock when the tab comes back.
  useEffect(() => {
    if (phase.kind !== "run") return;
    let lock: { release: () => Promise<void> } | null = null;
    const grab = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
      } catch {
        /* low battery / unsupported — the workout goes on */
      }
    };
    void grab();
    const onVisible = () => {
      if (document.visibilityState === "visible") void grab();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [phase.kind]);

  // The rest countdown.
  useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) {
      playSfx("blip");
      if (typeof navigator !== "undefined") navigator.vibrate?.([120, 60, 120]);
      setRestLeft(null);
      return;
    }
    const t = setTimeout(() => setRestLeft((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  const finish = useCallback(
    async (day: number) => {
      setPhase({ kind: "done", day });
      confettiCelebrate();
      if (logged.current) return;
      logged.current = true;
      try {
        const res = await api<LogResult>("/api/fitness/logs", {
          method: "POST",
          body: { planId, dayIndex: day },
        });
        setResult(res);
      } catch {
        /* the sweat still counts */
      }
    },
    [planId]
  );

  if (phase.kind === "pick") {
    return (
      <Shell title={title} planId={planId}>
        <p className="brutal-label">Pick today's poison</p>
        <div className="mt-2 space-y-3">
          {doc.days.map((day, di) => (
            <button
              key={di}
              type="button"
              onClick={() => setPhase({ kind: "run", day: di, ex: 0 })}
              className="brutal-card brutal-press block w-full p-4 text-left"
            >
              <span className="font-display text-lg font-bold uppercase">{day.name}</span>
              <span className="mt-1 block font-mono text-xs text-ink/60">
                {flatten(day).length} lifts{day.focus ? ` · ${day.focus}` : ""}
              </span>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  if (phase.kind === "done") {
    const day = doc.days[phase.day];
    return (
      <Shell title={title} planId={planId}>
        <div className="brutal-card p-8 text-center">
          <PixelIcon name="trophy" size={56} className="mx-auto text-ink" />
          <h2 className="mt-3 font-display text-3xl font-bold uppercase">{day.name}: destroyed</h2>
          <p className="mt-2 text-ink/70">The iron yielded. The log remembers.</p>
          {result && (
            <p className="mt-4 font-mono text-sm font-bold uppercase">
              {result.weekConquered
                ? "🏆 WEEK CONQUERED — +300 coins"
                : result.firstToday
                  ? "✓ session logged · +25 coins"
                  : "✓ session logged (the daily coin already dropped)"}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/pump/${planId}`} className="brutal-press border-3 border-ink bg-accent-bronze px-4 py-2 font-display font-bold uppercase text-ink no-underline shadow-brutal">
              Back to the program
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const day = doc.days[phase.day];
  const lifts = flatten(day);
  const ex = lifts[phase.ex];
  const sets = ex.sets ?? 0;
  const last = phase.ex === lifts.length - 1;

  const nextLift = () => {
    setSetsDone(0);
    setRestLeft(null);
    if (last) void finish(phase.day);
    else setPhase({ kind: "run", day: phase.day, ex: phase.ex + 1 });
  };
  const setDone = () => {
    const n = setsDone + 1;
    if (n >= sets) {
      nextLift();
    } else {
      setSetsDone(n);
      setRestLeft(restSeconds(ex.rest));
    }
  };

  return (
    <Shell title={`${title} · ${day.name}`} planId={planId}>
      {/* progress pips */}
      <div className="flex flex-wrap gap-1.5">
        {lifts.map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 border-2 border-ink ${i < phase.ex ? "bg-ink" : i === phase.ex ? "bg-accent-bronze" : "bg-card"}`}
          />
        ))}
      </div>

      <div className="brutal-card mt-4 p-6">
        {ex.blockLabel && (
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink/50">⛓ {ex.blockLabel}</p>
        )}
        <h2 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl">{ex.name}</h2>
        <p className="mt-3 font-mono text-lg">
          {ex.sets != null && <strong>{ex.sets} sets</strong>}
          {ex.reps && <> × <strong>{ex.reps}</strong></>}
          {ex.load && <span className="text-ink/70"> @ {ex.load}</span>}
        </p>
        {ex.notes && <p className="mt-2 text-sm text-ink/60">{ex.notes}</p>}

        {sets > 0 && (
          <div className="mt-5 flex gap-2">
            {Array.from({ length: sets }, (_, i) => (
              <span
                key={i}
                className={`h-5 w-5 border-2 border-ink ${i < setsDone ? "bg-accent-bronze" : "bg-card"}`}
              />
            ))}
          </div>
        )}

        {restLeft != null ? (
          <div className="mt-6 border-3 border-ink bg-paper p-4 text-center">
            <p className="brutal-label">Rest. You've earned 90 seconds of peace.</p>
            <p className="font-display text-5xl font-bold tabular-nums">
              {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
            </p>
            <button
              type="button"
              onClick={() => setRestLeft(null)}
              className="mt-2 font-mono text-xs font-bold uppercase tracking-wide text-ink/50 hover:text-ink"
            >
              skip the peace →
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sets > 0 ? (
              <Button onClick={setDone} className="w-full !bg-accent-bronze !text-ink">
                Set done ({setsDone + 1}/{sets})
              </Button>
            ) : (
              <Button onClick={nextLift} className="w-full !bg-accent-bronze !text-ink">
                {last ? "Finish the day" : "Done — next lift →"}
              </Button>
            )}
            {sets > 0 && (
              <button
                type="button"
                onClick={nextLift}
                className="block w-full text-center font-mono text-xs font-bold uppercase tracking-wide text-ink/50 hover:text-ink"
              >
                {last ? "call it — finish the day" : "skip to next lift →"}
              </button>
            )}
          </div>
        )}
      </div>

      {phase.ex > 0 && (
        <button
          type="button"
          onClick={() => {
            setSetsDone(0);
            setRestLeft(null);
            setPhase({ kind: "run", day: phase.day, ex: phase.ex - 1 });
          }}
          className="mt-3 font-mono text-xs font-bold uppercase tracking-wide text-ink/50 hover:text-ink"
        >
          ← previous lift
        </button>
      )}
    </Shell>
  );
}

function Shell({ title, planId, children }: { title: string; planId: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1100] overflow-y-auto bg-paper px-4 pb-10 pt-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-mono text-xs font-bold uppercase tracking-wider text-ink/60">
            {title}
          </p>
          <Link
            href={`/pump/${planId}`}
            className="shrink-0 border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
          >
            ✕ bail
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
