"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { LogResult } from "@/modules/fitness/service";

/**
 * The one-tap check-in on a program day. First log of the day carries the
 * coin; the third training day of the week flips the label to the trophy.
 */
export function LogSessionButton({ planId, dayIndex }: { planId: string; dayIndex: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "week">("idle");

  async function log() {
    setState("busy");
    try {
      const res = await api<LogResult>("/api/fitness/logs", {
        method: "POST",
        body: { planId, dayIndex },
      });
      setState(res.weekConquered ? "week" : "done");
      router.refresh();
    } catch {
      setState("idle");
    }
  }

  if (state === "done") return <span className="font-mono text-xs font-bold uppercase text-ink">✓ logged</span>;
  if (state === "week")
    return <span className="font-mono text-xs font-bold uppercase text-ink">🏆 week conquered</span>;
  return (
    <button
      type="button"
      onClick={log}
      disabled={state === "busy"}
      className="brutal-press border-2 border-ink bg-paper px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wide shadow-brutal-sm disabled:opacity-50"
    >
      {state === "busy" ? "…" : "Crushed it"}
    </button>
  );
}
