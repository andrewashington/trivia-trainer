"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";

export type GraphNode = { authorId: string; name: string; avatarUrl: string | null; weight: number };
export type GraphEdge = { a: string; b: string; shared: number };

const W = 1000;
const H = 650;

/**
 * Force-directed social graph of segment CO-PARTICIPATION — who shows up in the
 * same conversation bursts. Edge thickness = shared bursts; node size = activity.
 * Layout is a small Fruchterman–Reingold-style simulation run once on mount
 * (only a couple dozen nodes, so it's instant). Edges drawn as SVG; nodes are
 * positioned HTML overlays so we can reuse the real <Avatar>.
 */
export function SocialGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => simulate(nodes, edges), [nodes, edges]);
  const maxShared = Math.max(1, ...edges.map((e) => e.shared));
  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight));
  const pos = layout; // Map<authorId, {x,y}>

  if (nodes.length < 2) return null;

  const connected = (id: string) =>
    new Set(
      edges.filter((e) => e.a === id || e.b === id).flatMap((e) => [e.a, e.b]),
    );
  const lit = hover ? connected(hover) : null;

  return (
    <div className="relative w-full border-3 border-ink bg-ink shadow-brutal" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {edges.map((e, i) => {
          const p = pos.get(e.a);
          const q = pos.get(e.b);
          if (!p || !q) return null;
          const active = !hover || e.a === hover || e.b === hover;
          return (
            <line
              key={i}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={active ? "#5865F2" : "#ffffff"}
              strokeOpacity={active ? 0.55 : 0.06}
              strokeWidth={0.6 + (e.shared / maxShared) * 5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {nodes.map((n) => {
        const p = pos.get(n.authorId);
        if (!p) return null;
        const size = n.weight / maxWeight > 0.5 ? "lg" : n.weight / maxWeight > 0.18 ? "md" : "sm";
        const dim = lit && !lit.has(n.authorId);
        return (
          <Link
            key={n.authorId}
            href={`/discord-stats/people/${n.authorId}`}
            onMouseEnter={() => setHover(n.authorId)}
            onMouseLeave={() => setHover(null)}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center no-underline"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, opacity: dim ? 0.25 : 1 }}
          >
            <span className="rounded-none ring-2 ring-ink">
              <Avatar name={n.name} src={n.avatarUrl} size={size} />
            </span>
            <span className="mt-0.5 max-w-[80px] truncate rounded-sm bg-ink/80 px-1 font-mono text-[9px] font-bold text-white">
              {n.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Tiny force-directed layout. Deterministic-ish: ring init + cooled FR forces. */
function simulate(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const n = nodes.length;
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const cx = W / 2;
  const cy = H / 2;
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2;
    pos.set(nd.authorId, { x: cx + Math.cos(a) * 250, y: cy + Math.sin(a) * 180, vx: 0, vy: 0 });
  });

  const maxShared = Math.max(1, ...edges.map((e) => e.shared));
  const k = 220; // ideal distance scale
  const REP = 90000; // repulsion strength
  let temp = 120;

  for (let it = 0; it < 400; it++) {
    const disp = new Map(nodes.map((nd) => [nd.authorId, { x: 0, y: 0 }]));
    // repulsion between every pair
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(nodes[i].authorId)!;
        const b = pos.get(nodes[j].authorId)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          d2 = 1;
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
        }
        const f = REP / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        disp.get(nodes[i].authorId)!.x += fx;
        disp.get(nodes[i].authorId)!.y += fy;
        disp.get(nodes[j].authorId)!.x -= fx;
        disp.get(nodes[j].authorId)!.y -= fy;
      }
    }
    // attraction along edges (weighted)
    for (const e of edges) {
      const a = pos.get(e.a);
      const b = pos.get(e.b);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const w = 0.3 + (e.shared / maxShared) * 1.7;
      const f = ((d * d) / k) * w * 0.0012;
      const fx = (dx / d) * f * d;
      const fy = (dy / d) * f * d;
      disp.get(e.a)!.x -= fx;
      disp.get(e.a)!.y -= fy;
      disp.get(e.b)!.x += fx;
      disp.get(e.b)!.y += fy;
    }
    // apply with cooling + gentle centering, clamp to bounds
    for (const nd of nodes) {
      const p = pos.get(nd.authorId)!;
      const dp = disp.get(nd.authorId)!;
      const dl = Math.sqrt(dp.x * dp.x + dp.y * dp.y) || 1;
      p.x += (dp.x / dl) * Math.min(dl, temp);
      p.y += (dp.y / dl) * Math.min(dl, temp);
      p.x += (cx - p.x) * 0.01;
      p.y += (cy - p.y) * 0.01;
      p.x = Math.max(60, Math.min(W - 60, p.x));
      p.y = Math.max(50, Math.min(H - 50, p.y));
    }
    temp = Math.max(4, temp * 0.985);
  }

  return new Map([...pos.entries()].map(([id, p]) => [id, { x: p.x, y: p.y }]));
}
