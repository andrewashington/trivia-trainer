"use client";

import { useEffect, useState } from "react";

/** Live ticking countdown. Renders a dash until mounted (hydration-safe). */
export function Countdown({
  to,
  doneText = "NOW",
  className = "",
}: {
  to: string;
  doneText?: string;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return <span className={`tabular-nums ${className}`}>—:—:—</span>;
  }

  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className={className}>{doneText}</span>;

  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className={`tabular-nums ${className}`}>
      {d > 0 ? `${d}d ` : ""}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
