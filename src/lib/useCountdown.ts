"use client";

import { useEffect, useState } from "react";

export type CountdownParts = {
  /** False until mounted — render a placeholder to stay hydration-safe. */
  ready: boolean;
  /** Target is in the past. */
  done: boolean;
  ms: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Compact human label: "3d 4h", "4h 12m", "12m 30s", "42s". */
  label: string;
};

/**
 * Live-ticking time-to-target, shared by the Countdowns tiles and the
 * Stakes deadline chips. Ticks every second inside the final hour and
 * every minute beyond it (re-evaluated each tick, so it speeds up as
 * the target approaches).
 */
export function useCountdown(targetIso: string): CountdownParts {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      const left = new Date(targetIso).getTime() - Date.now();
      id = setTimeout(tick, left > 3_600_000 ? 60_000 : 1000);
    };
    const left = new Date(targetIso).getTime() - Date.now();
    id = setTimeout(tick, left > 3_600_000 ? 60_000 : 1000);
    return () => clearTimeout(id);
  }, [targetIso]);

  if (now === null) {
    return { ready: false, done: false, ms: 0, days: 0, hours: 0, minutes: 0, seconds: 0, label: "—" };
  }

  const ms = Math.max(0, new Date(targetIso).getTime() - now);
  const done = ms <= 0;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);

  const label = done
    ? "now"
    : days > 0
      ? `${days}d ${hours}h`
      : hours > 0
        ? `${hours}h ${minutes}m`
        : minutes > 0
          ? `${minutes}m ${seconds}s`
          : `${seconds}s`;

  return { ready: true, done, ms, days, hours, minutes, seconds, label };
}
