"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ChartPoint = { t: string; v: number };

// viewBox space — strokes use non-scaling so borders stay crisp at any width.
const W = 600;
const H = 220;
const PAD = { top: 16, right: 14, bottom: 22, left: 14 };

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function BalanceChart({
  points,
  peak,
}: {
  points: ChartPoint[];
  peak: { value: number; at: string | null };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const geo = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const vals = points.map((p) => p.v);
    const max = Math.max(...vals, 1);
    // Headroom on top; floor at zero so the area reads as "money in the bank".
    const lo = 0;
    const hi = max * 1.12 || 1;
    const x = (i: number) =>
      PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
    const coords = points.map((p, i) => ({ x: x(i), y: y(p.v), ...p }));
    const line = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const baseY = PAD.top + innerH;
    const area = coords.length
      ? `M${coords[0].x.toFixed(1)} ${baseY} ` +
        coords.map((c) => `L${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ") +
        ` L${coords[coords.length - 1].x.toFixed(1)} ${baseY} Z`
      : "";
    return { coords, line, area, baseY, hi, max };
  }, [points]);

  if (points.length === 0) return null;

  const active = hover != null ? geo.coords[hover] : null;
  const peakDay = peak.at != null ? peak.at.slice(0, 10) : null;
  const peakIdx = peakDay != null ? points.findIndex((p) => p.t === peakDay) : -1;
  const peakC = peakIdx >= 0 ? geo.coords[peakIdx] : null;

  function onMove(e: React.PointerEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (points.length - 1)));
  }

  return (
    <div ref={wrapRef} className="relative select-none" onPointerLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block touch-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        role="img"
        aria-label="Coin balance over time"
      >
        {/* baseline */}
        <line
          x1={PAD.left}
          y1={geo.baseY}
          x2={W - PAD.right}
          y2={geo.baseY}
          stroke="#101010"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
        {/* area + line, wiped up on mount */}
        <g
          className="origin-bottom transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{ transform: drawn ? "scaleY(1)" : "scaleY(0)" }}
        >
          <path d={geo.area} fill="#FFD60A" fillOpacity={0.55} />
          <path
            d={geo.line}
            fill="none"
            stroke="#101010"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        {/* all-time peak marker */}
        {peakC && peak.value > 0 && (
          <g>
            <line
              x1={peakC.x}
              y1={PAD.top}
              x2={peakC.x}
              y2={geo.baseY}
              stroke="#101010"
              strokeWidth={1.5}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
              opacity={0.4}
            />
            <circle cx={peakC.x} cy={peakC.y} r={5} fill="#3DDC4E" stroke="#101010" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {/* hover crosshair + dot */}
        {active && (
          <g>
            <line
              x1={active.x}
              y1={PAD.top}
              x2={active.x}
              y2={geo.baseY}
              stroke="#101010"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={active.x} cy={active.y} r={5.5} fill="#FFD60A" stroke="#101010" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>

      {/* readouts: hover chip, or endpoints when idle */}
      {active ? (
        <div className="pointer-events-none absolute left-2 top-2 border-3 border-ink bg-card px-2 py-1 shadow-brutal-sm">
          <div className="font-mono text-base font-bold tabular-nums leading-none">
            {active.v.toLocaleString()}
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/55">
            {shortDate(active.t)}
          </div>
        </div>
      ) : (
        <div className="mt-1 flex justify-between font-mono text-[10px] font-bold uppercase tracking-wide text-ink/55">
          <span>{shortDate(points[0].t)}</span>
          <span>{points.length > 1 ? shortDate(points[points.length - 1].t) : ""}</span>
        </div>
      )}
    </div>
  );
}
