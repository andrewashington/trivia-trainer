import { monthLabel } from "../format";

/**
 * A brutalist area chart for a monthly time series. Pure SVG, responsive via
 * viewBox. Labels a handful of x-ticks so 60+ months stay readable.
 */
export function AreaSparkline({
  points,
  color = "#5865F2",
  height = 120,
}: {
  points: { month: string; count: number }[];
  color?: string;
  height?: number;
}) {
  if (points.length < 2) {
    return <p className="text-sm text-ink/50">Not enough history to chart yet.</p>;
  }
  const W = 800;
  const H = height;
  const pad = 4;
  const max = Math.max(...points.map((p) => p.count));
  const n = points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;

  const tickEvery = Math.ceil(n / 8);
  const peak = points.reduce((b, p, i) => (p.count > points[b].count ? i : b), 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border-3 border-ink bg-card" preserveAspectRatio="none">
        <path d={area} fill={color} fillOpacity={0.25} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} />
        <circle cx={x(peak)} cy={y(points[peak].count)} r={4} fill="#101010" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase text-ink/45">
        {points
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => i % tickEvery === 0 || i === n - 1)
          .map(({ p }) => (
            <span key={p.month}>{monthLabel(p.month)}</span>
          ))}
      </div>
    </div>
  );
}
