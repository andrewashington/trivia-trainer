"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "@/components/icons";
import { clusterColor } from "../format";

type Point = { id: string; x: number; y: number; c: number; e: number; at: string; ch: string | null; s: string };
type Cluster = { id: number; label: string; size: number };
type Detail = { text: string; channelName: string | null; at: string; guildId: string | null; channelId: string };

/**
 * The Vibe Galaxy: every conversation burst is a star, positioned by a 2D
 * projection of its embedding (scripts/discord-insights.mjs), colored by topic
 * cluster (or by era). Pan to roam, scroll to zoom, hover to peek, click to read
 * the whole conversation. Canvas-rendered so thousands of stars stay smooth.
 */
export function GalaxyCanvas({ points, clusters }: { points: Point[]; clusters: Cluster[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, ox: 0, oy: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [colorBy, setColorBy] = useState<"cluster" | "era">("cluster");
  const [hover, setHover] = useState<{ p: Point; sx: number; sy: number } | null>(null);
  const [selected, setSelected] = useState<Point | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const clusterLabel = useMemo(() => new Map(clusters.map((c) => [c.id, c.label])), [clusters]);
  const eras = useMemo(() => [...new Set(points.map((p) => p.e))].sort(), [points]);
  const eraColor = useMemo(() => {
    const m = new Map<number, string>();
    eras.forEach((e, i) => m.set(e, clusterColor(i)));
    return m;
  }, [eras]);

  const bounds = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [points]);

  const colorOf = (p: Point) =>
    colorBy === "cluster" ? clusterColor(p.c) : eraColor.get(p.e) ?? "#888";

  // Centroid per cluster (for floating labels), in data coords.
  const centroids = useMemo(() => {
    const acc = new Map<number, { x: number; y: number; n: number }>();
    for (const p of points) {
      const a = acc.get(p.c) ?? { x: 0, y: 0, n: 0 };
      a.x += p.x;
      a.y += p.y;
      a.n += 1;
      acc.set(p.c, a);
    }
    return [...acc.entries()].map(([id, a]) => ({ id, x: a.x / a.n, y: a.y / a.n, n: a.n }));
  }, [points]);

  function dataToScreen(px: number, py: number, w: number, h: number) {
    const pad = 30;
    const sx = (px - bounds.minX) / (bounds.maxX - bounds.minX || 1);
    const sy = (py - bounds.minY) / (bounds.maxY - bounds.minY || 1);
    const baseX = pad + sx * (w - pad * 2);
    const baseY = pad + sy * (h - pad * 2);
    return {
      x: baseX * view.current.scale + view.current.ox,
      y: baseY * view.current.scale + view.current.oy,
    };
  }

  function draw() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 520;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, w, h);

    const r = Math.max(1, 1.6 * Math.sqrt(view.current.scale));
    for (const p of points) {
      const { x, y } = dataToScreen(p.x, p.y, w, h);
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
      ctx.fillStyle = colorOf(p);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (colorBy === "cluster" && view.current.scale < 6) {
      ctx.font = "bold 12px 'Space Mono', monospace";
      ctx.textAlign = "center";
      for (const c of centroids) {
        const label = clusterLabel.get(c.id);
        if (!label) continue;
        const { x, y } = dataToScreen(c.x, c.y, w, h);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const tw = ctx.measureText(label).width;
        ctx.fillRect(x - tw / 2 - 4, y - 9, tw + 8, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x, y + 3);
      }
    }
  }

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, colorBy]);

  function nearest(clientX: number, clientY: number): { p: Point; sx: number; sy: number } | null {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const w = wrap.clientWidth;
    const h = 520;
    let best: { p: Point; sx: number; sy: number; d: number } | null = null;
    for (const p of points) {
      const { x, y } = dataToScreen(p.x, p.y, w, h);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < 64 && (!best || d < best.d)) best = { p, sx: x, sy: y, d };
    }
    return best ? { p: best.p, sx: best.sx, sy: best.sy } : null;
  }

  async function openDetail(p: Point) {
    setSelected(p);
    setDetail(null);
    try {
      const res = await fetch(`/api/discord-stats/segment/${p.id}`);
      if (res.ok) setDetail((await res.json()) as Detail);
    } catch {
      /* ignore */
    }
  }

  if (!points.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["cluster", "era"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorBy(mode)}
              className={`brutal-press border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
                colorBy === mode ? "bg-accent-blurple text-white" : "bg-card text-ink"
              }`}
            >
              by {mode}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-ink/50">
          {points.length.toLocaleString()} conversations · scroll to zoom, drag to roam
        </span>
      </div>

      <div ref={wrapRef} className="relative border-3 border-ink shadow-brutal">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              view.current.ox = drag.current.ox + (e.clientX - drag.current.x);
              view.current.oy = drag.current.oy + (e.clientY - drag.current.y);
              draw();
              setHover(null);
            } else {
              setHover(nearest(e.clientX, e.clientY));
            }
          }}
          onPointerUp={(e) => {
            const wasDrag =
              drag.current && (Math.abs(e.clientX - drag.current.x) > 4 || Math.abs(e.clientY - drag.current.y) > 4);
            drag.current = null;
            if (!wasDrag) {
              const hit = nearest(e.clientX, e.clientY);
              if (hit) openDetail(hit.p);
            }
          }}
          onPointerLeave={() => setHover(null)}
          onWheel={(e) => {
            const wrap = wrapRef.current;
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            const next = Math.min(40, Math.max(0.5, view.current.scale * factor));
            const k = next / view.current.scale;
            view.current.ox = mx - (mx - view.current.ox) * k;
            view.current.oy = my - (my - view.current.oy) * k;
            view.current.scale = next;
            draw();
          }}
        />

        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs border-2 border-ink bg-paper px-2 py-1 text-xs shadow-brutal-sm"
            style={{ left: Math.min(hover.sx + 10, 280), top: hover.sy + 10 }}
          >
            <p className="font-mono text-[10px] uppercase text-ink/50">
              {hover.p.ch ? `#${hover.p.ch}` : "?"} · {hover.p.at}
            </p>
            <p className="line-clamp-2">{hover.p.s}</p>
          </div>
        )}

        {selected && (
          <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l-3 border-ink bg-card">
            <div className="flex items-center justify-between border-b-3 border-ink bg-accent-blurple px-3 py-2 text-white">
              <span className="font-mono text-xs uppercase">
                {(detail?.channelName ?? selected.ch) ? `#${detail?.channelName ?? selected.ch}` : "conversation"}
                {" · "}
                {(detail?.at ?? selected.at).slice(0, 10)}
              </span>
              <button onClick={() => setSelected(null)} aria-label="Close">
                <PixelIcon name="close" size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {detail ? (
                <p className="whitespace-pre-wrap font-body text-sm leading-snug">{detail.text}</p>
              ) : (
                <p className="text-sm text-ink/50">Loading the conversation…</p>
              )}
              {detail?.guildId && (
                <a
                  href={`https://discord.com/channels/${detail.guildId}/${detail.channelId}/${selected.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block font-mono text-xs underline"
                >
                  open in Discord ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
