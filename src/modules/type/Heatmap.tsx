import type { KeyRow } from "./engine";
import { userMedianLatency, weakness } from "./engine";

const ROWS = [
  "qwertyuiop".split(""),
  "asdfghjkl".split(""),
  "zxcvbnm".split(""),
];

export function Heatmap({ stats }: { stats: KeyRow[] }) {
  const by = new Map(stats.map((s) => [s.grapheme, s]));
  const median = userMedianLatency(stats);
  return (
    <div className="space-y-1.5">
      {ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1" style={{ paddingLeft: i * 12 }}>
          {row.map((g) => {
            const s = by.get(g);
            const w = s ? weakness(s.hits, s.misses, s.latencyEmaMs, median) : null;
            const samples = s ? s.hits + s.misses : 0;
            const bg =
              w == null
                ? "bg-paper"
                : w >= 0.25
                  ? "bg-accent-red text-white"
                  : w >= 0.15
                    ? "bg-accent-orange"
                    : "bg-accent-green";
            return (
              <span
                key={g}
                title={samples ? `${g}: ${(w ?? 0).toFixed(2)} · ${samples} hits` : `${g}: learning`}
                className={`inline-flex h-8 w-8 items-center justify-center border-2 border-ink font-mono text-sm font-bold uppercase ${bg}`}
              >
                {g}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
