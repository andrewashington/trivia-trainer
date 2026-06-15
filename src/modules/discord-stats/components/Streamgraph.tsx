import type { TopicCluster, TrendPoint } from "../insights";
import { clusterColor, monthLabel } from "../format";

/**
 * Topics-over-time as a centered streamgraph (theme river): each band is a topic
 * cluster, its thickness the share of conversation that month. Shows themes
 * rising and dying across the archive's life. Pure SVG.
 */
export function Streamgraph({
  clusters,
  trends,
}: {
  clusters: TopicCluster[];
  trends: TrendPoint[];
}) {
  if (!clusters.length || !trends.length) return null;

  const months = [...new Set(trends.map((t) => t.month))].sort();
  if (months.length < 2) return null;
  const monthIdx = new Map(months.map((m, i) => [m, i]));

  // series[clusterId][monthIndex] = count
  const series = new Map<number, number[]>();
  for (const c of clusters) series.set(c.id, Array(months.length).fill(0));
  for (const t of trends) {
    const arr = series.get(t.clusterId);
    const mi = monthIdx.get(t.month);
    if (arr && mi != null) arr[mi] = t.count;
  }

  const order = clusters.map((c) => c.id).filter((id) => series.has(id));
  const totals = months.map((_, mi) => order.reduce((s, id) => s + (series.get(id)![mi] || 0), 0));
  const maxTotal = Math.max(1, ...totals);

  const W = 800;
  const H = 240;
  const x = (mi: number) => (mi / (months.length - 1)) * W;
  const scaleY = (v: number) => (v / maxTotal) * (H - 20);

  // Stack from a centered baseline so it reads as a river.
  const tops: number[][] = order.map(() => Array(months.length).fill(0));
  const bots: number[][] = order.map(() => Array(months.length).fill(0));
  for (let mi = 0; mi < months.length; mi++) {
    let cursor = H / 2 - scaleY(totals[mi]) / 2;
    order.forEach((id, oi) => {
      const v = series.get(id)![mi] || 0;
      const h = scaleY(v);
      tops[oi][mi] = cursor;
      bots[oi][mi] = cursor + h;
      cursor += h;
    });
  }

  const bandPath = (oi: number) => {
    const top = months.map((_, mi) => `${mi === 0 ? "M" : "L"}${x(mi).toFixed(1)},${tops[oi][mi].toFixed(1)}`).join(" ");
    const bottom = months
      .map((_, mi) => `L${x(months.length - 1 - mi).toFixed(1)},${bots[oi][months.length - 1 - mi].toFixed(1)}`)
      .join(" ");
    return `${top} ${bottom} Z`;
  };

  const tickEvery = Math.ceil(months.length / 8);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full border-3 border-ink bg-ink" preserveAspectRatio="none">
        {order.map((id, oi) => (
          <path key={id} d={bandPath(oi)} fill={clusterColor(oi)} fillOpacity={0.9} stroke="#101010" strokeWidth={0.5} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase text-ink/45">
        {months
          .map((m, i) => ({ m, i }))
          .filter(({ i }) => i % tickEvery === 0 || i === months.length - 1)
          .map(({ m }) => (
            <span key={m}>{monthLabel(m)}</span>
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {order.map((id, oi) => {
          const c = clusters.find((cl) => cl.id === id)!;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 border-2 border-ink bg-card px-2 py-0.5 font-mono text-[11px]"
            >
              <span className="h-2.5 w-2.5 border border-ink" style={{ backgroundColor: clusterColor(oi) }} />
              {c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
