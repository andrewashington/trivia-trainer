"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { api } from "@/lib/client";

type Tool = "pen" | "marker" | "highlighter" | "stamp";

export type CanvasStrokeDTO = {
  id: string;
  tool: string;
  color: string;
  size: number;
  points: [number, number][];
  stamp: string | null;
  createdAt: string;
  userId: string;
  userName: string;
};

type Camera = { x: number; y: number; zoom: number };

const COLORS = [
  "#000000", "#FFFFFF", "#FF3B30", "#FF9500",
  "#FFE600", "#7CFC00", "#00C853", "#00E5FF",
  "#00B8D9", "#2962FF", "#651FFF", "#D500F9",
  "#FF4081", "#FF6E40", "#8D6E63", "#FF1493",
];

const STAMPS = ["🔥", "💀", "😂", "❤️", "🍕", "👑", "💩", "⭐", "🦴", "🌈", "🍆", "🎯"];

const TOOLS: { key: Tool; label: string }[] = [
  { key: "pen", label: "PEN" },
  { key: "marker", label: "MARKER" },
  { key: "highlighter", label: "HILITE" },
  { key: "stamp", label: "STAMP" },
];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

function toolAlpha(tool: string) {
  if (tool === "highlighter") return 0.35;
  if (tool === "marker") return 0.8;
  return 1;
}

function freehandOptions(tool: string, size: number) {
  if (tool === "marker") {
    return { size: size * 1.8, thinning: 0.1, smoothing: 0.5, streamline: 0.5 };
  }
  if (tool === "highlighter") {
    return { size: size * 3, thinning: 0, smoothing: 0.6, streamline: 0.5 };
  }
  return { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 };
}

function strokePath(stroke: { tool: string; size: number; points: [number, number][] }) {
  const outline = getStroke(stroke.points, freehandOptions(stroke.tool, stroke.size));
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
  path.closePath();
  return path;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: { tool: string; color: string; size: number; points: [number, number][]; stamp?: string | null }
) {
  if (stroke.tool === "stamp") {
    const [x, y] = stroke.points[0] ?? [0, 0];
    ctx.globalAlpha = 1;
    ctx.font = `${stroke.size * 3}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stroke.stamp ?? "❓", x, y);
    return;
  }
  if (stroke.points.length === 0) return;
  ctx.globalAlpha = toolAlpha(stroke.tool);
  ctx.fillStyle = stroke.color;
  ctx.fill(strokePath(stroke));
  ctx.globalAlpha = 1;
}

export function CanvasBoard({ initialStrokes }: { initialStrokes: CanvasStrokeDTO[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Mutable drawing state lives in refs so pointer handlers stay cheap.
  const strokesRef = useRef<CanvasStrokeDTO[]>(initialStrokes);
  const seenIds = useRef<Set<string>>(new Set(initialStrokes.map((s) => s.id)));
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const liveRef = useRef<[number, number][] | null>(null);
  const spaceRef = useRef(false);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStateRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ dist: number; mid: [number, number] } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[2]);
  const [size, setSize] = useState(8);
  const [stamp, setStamp] = useState(STAMPS[0]);
  const [zoomPct, setZoomPct] = useState(100);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const stampRef = useRef(stamp);
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;
  stampRef.current = stamp;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cam = cameraRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    const live = liveRef.current;
    if (live && live.length > 0) {
      drawStroke(ctx, {
        tool: toolRef.current,
        color: colorRef.current,
        size: sizeRef.current,
        points: live,
      });
    }
  }, []);

  const requestRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redraw();
    });
  }, [redraw]);

  // Canvas sizing (DPR-aware) + resize observer.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      requestRedraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [requestRedraw]);

  // Space key = pan mode.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Wheel zoom toward cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cam = cameraRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
      // Keep the world point under the cursor fixed.
      cam.x = cam.x + sx / cam.zoom - sx / newZoom;
      cam.y = cam.y + sy / cam.zoom - sy / newZoom;
      cam.zoom = newZoom;
      setZoomPct(Math.round(newZoom * 100));
      requestRedraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [requestRedraw]);

  // Poll for friends' strokes every 4s.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const list = strokesRef.current;
        const since = list.length > 0 ? list[list.length - 1].createdAt : "";
        const res = await fetch(
          `/api/canvas${since ? `?since=${encodeURIComponent(since)}` : ""}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { strokes: CanvasStrokeDTO[] };
        let added = false;
        for (const s of data.strokes) {
          if (!seenIds.current.has(s.id)) {
            seenIds.current.add(s.id);
            strokesRef.current.push(s);
            added = true;
          }
        }
        if (added && !stopped) requestRedraw();
      } catch {
        // Network hiccup — next poll will catch up.
      }
    };
    const interval = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [requestRedraw]);

  const toWorld = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    return [
      (clientX - rect.left) / cam.zoom + cam.x,
      (clientY - rect.top) / cam.zoom + cam.y,
    ];
  }, []);

  const commitStroke = useCallback(
    async (points: [number, number][], t: Tool) => {
      setPosting(true);
      setError(null);
      try {
        const body: Record<string, unknown> = {
          tool: t,
          color: colorRef.current,
          size: sizeRef.current,
          points: points.slice(0, 2000),
        };
        if (t === "stamp") body.stamp = stampRef.current;
        const data = await api<{ stroke: CanvasStrokeDTO }>("/api/canvas", {
          method: "POST",
          body,
        });
        if (!seenIds.current.has(data.stroke.id)) {
          seenIds.current.add(data.stroke.id);
          strokesRef.current.push(data.stroke);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save stroke.");
      } finally {
        setPosting(false);
        requestRedraw();
      }
    },
    [requestRedraw]
  );

  const pinchInfo = () => {
    const pts = [...pointersRef.current.values()];
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return {
      dist: Math.hypot(dx, dy) || 1,
      mid: [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] as [number, number],
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // Second finger down: abandon any in-progress draw, start pinch.
      liveRef.current = null;
      panStateRef.current = null;
      pinchRef.current = pinchInfo();
      requestRedraw();
      return;
    }

    const panning = spaceRef.current || e.button === 1;
    if (panning) {
      panStateRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    liveRef.current = [toWorld(e.clientX, e.clientY)];
    requestRedraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cam = cameraRef.current;

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const prev = pinchRef.current;
      const next = pinchInfo();
      const rect = canvasRef.current!.getBoundingClientRect();
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * (next.dist / prev.dist)));
      const sx = next.mid[0] - rect.left;
      const sy = next.mid[1] - rect.top;
      // Zoom about the midpoint, then pan by the midpoint delta.
      cam.x = cam.x + sx / cam.zoom - sx / newZoom - (next.mid[0] - prev.mid[0]) / newZoom;
      cam.y = cam.y + sy / cam.zoom - sy / newZoom - (next.mid[1] - prev.mid[1]) / newZoom;
      cam.zoom = newZoom;
      pinchRef.current = next;
      setZoomPct(Math.round(newZoom * 100));
      requestRedraw();
      return;
    }

    if (panStateRef.current) {
      cam.x -= (e.clientX - panStateRef.current.x) / cam.zoom;
      cam.y -= (e.clientY - panStateRef.current.y) / cam.zoom;
      panStateRef.current = { x: e.clientX, y: e.clientY };
      requestRedraw();
      return;
    }

    if (liveRef.current && toolRef.current !== "stamp") {
      if (liveRef.current.length < 2000) {
        liveRef.current.push(toWorld(e.clientX, e.clientY));
      }
      requestRedraw();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (panStateRef.current) {
      panStateRef.current = null;
      return;
    }
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    const t = toolRef.current;
    if (t === "stamp") {
      void commitStroke([toWorld(e.clientX, e.clientY)], "stamp");
    } else if (live.length > 0) {
      void commitStroke(live, t);
    }
    requestRedraw();
  };

  const resetCamera = () => {
    cameraRef.current = { x: 0, y: 0, zoom: 1 };
    setZoomPct(100);
    requestRedraw();
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-2 border-ink bg-card p-3 shadow-brutal-sm">
        <div className="flex gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={`brutal-press border-2 border-ink px-2 py-1 font-mono text-xs ${
                tool === t.key ? "bg-accent-lagoon" : "bg-card"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`brutal-press h-6 w-6 border-2 border-ink ${
                color === c ? "ring-2 ring-ink ring-offset-1" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 font-mono text-xs">
          SIZE
          <input
            type="range"
            min={1}
            max={64}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-28 accent-ink"
          />
          <span className="w-6 text-right">{size}</span>
        </label>
        {tool === "stamp" && (
          <div className="flex flex-wrap gap-1">
            {STAMPS.map((s) => (
              <button
                key={s}
                onClick={() => setStamp(s)}
                className={`brutal-press border-2 border-ink px-1.5 py-0.5 text-lg leading-none ${
                  stamp === s ? "bg-accent-lagoon" : "bg-card"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Board */}
      <div
        ref={wrapRef}
        className="relative border-3 border-ink bg-white shadow-brutal"
        style={{ height: "70vh" }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          style={{ cursor: tool === "stamp" ? "copy" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <button
            onClick={resetCamera}
            className="brutal-press border-2 border-ink bg-card px-2 py-1 font-mono text-xs shadow-brutal-sm"
          >
            ↺ centre
          </button>
          <span className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs shadow-brutal-sm">
            {zoomPct}%
          </span>
          {posting && (
            <span className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs shadow-brutal-sm">
              saving…
            </span>
          )}
        </div>
      </div>

      <p className="font-mono text-xs opacity-70">
        scroll to zoom · space-drag or two fingers to pan · no eraser, ever
      </p>
      {error && (
        <p className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs text-red-600 shadow-brutal-sm">
          {error}
        </p>
      )}
    </div>
  );
}
