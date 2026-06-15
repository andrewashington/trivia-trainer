import type { HeatCell } from "../queries";
import { DOW, hourLabel } from "../format";

/**
 * Day-of-week × hour-of-day activity grid (Mountain Time). Cell intensity scales
 * with message volume; the busiest cell is called out.
 */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  let peak = { dow: 0, hour: 0, count: 0 };
  for (const c of cells) {
    if (c.dow < 0 || c.dow > 6 || c.hour < 0 || c.hour > 23) continue;
    grid[c.dow][c.hour] = c.count;
    if (c.count > max) max = c.count;
    if (c.count > peak.count) peak = { dow: c.dow, hour: c.hour, count: c.count };
  }
  if (!max) return <p className="text-sm text-ink/50">No activity to chart.</p>;

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex gap-1 pl-9">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-3.5 text-center font-mono text-[8px] text-ink/40">
              {h % 6 === 0 ? hourLabel(h).replace(/(am|pm)/, "") : ""}
            </div>
          ))}
        </div>
        {grid.map((row, dow) => (
          <div key={dow} className="mt-1 flex items-center gap-1">
            <div className="w-8 font-mono text-[10px] font-bold uppercase text-ink/50">{DOW[dow]}</div>
            {row.map((v, hour) => {
              const t = v / max;
              const isPeak = dow === peak.dow && hour === peak.hour;
              return (
                <div
                  key={hour}
                  title={`${DOW[dow]} ${hourLabel(hour)} — ${v.toLocaleString()} msgs`}
                  className={`h-3.5 w-3.5 border ${isPeak ? "border-ink" : "border-ink/10"}`}
                  style={{
                    backgroundColor: v ? "#5865F2" : "#F4F1EA",
                    opacity: v ? 0.18 + t * 0.82 : 1,
                  }}
                />
              );
            })}
          </div>
        ))}
        <p className="mt-2 font-mono text-[11px] uppercase text-ink/55">
          Peak: {DOW[peak.dow]} @ {hourLabel(peak.hour)} ({peak.count.toLocaleString()} msgs) · Mountain
          Time
        </p>
      </div>
    </div>
  );
}
