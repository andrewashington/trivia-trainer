"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import {
  GRID,
  PELLET_POINTS,
  BONUS_POINTS,
  BONUS_EVERY,
  BONUS_LIFETIME_MS,
  COMBO_WINDOW_MS,
  multiplierFor,
  tickFor,
} from "@/modules/snake/schema";

// Canvas colours — pulled from the brutalist palette (tailwind.config.ts).
const C = {
  paper: "#F4F1EA",
  ink: "#101010",
  grid: "rgba(16,16,16,0.08)",
  snake: "#9B5DE5", // accent-grape
  snakeHead: "#7A3FC4",
  pellet: "#FF4D2E", // accent-red
  bonus: "#FFD60A", // accent-yellow
};

const CELL = 30; // logical px per cell on the backing canvas
const DIM = GRID * CELL;

type Pt = { x: number; y: number };
type Dir = Pt;
type Status = "idle" | "running" | "paused" | "over";

const DIRS: Record<string, Dir> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEY_DIR: Record<string, keyof typeof DIRS> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

function randEmpty(occupied: Set<string>): Pt {
  // GRID*GRID is small (289); rejection sampling is plenty fast.
  let p: Pt;
  do {
    p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (occupied.has(`${p.x},${p.y}`));
  return p;
}

type SubmitResult = { isHighScore: boolean; isPersonalBest: boolean } | null;

export function SnakeGame() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- HUD state (re-renders) ---
  const [status, setStatus] = useState<Status>("idle");
  const [score, setScore] = useState(0);
  const [mult, setMult] = useState(1);
  const [comboPct, setComboPct] = useState(0); // 0..1 of the combo window left
  const [length, setLength] = useState(3);
  const [result, setResult] = useState<SubmitResult>(null);

  // --- Mutable game state (no re-render) ---
  const game = useRef({
    snake: [] as Pt[],
    dir: DIRS.right as Dir,
    queue: [] as Dir[],
    pellet: { x: 0, y: 0 } as Pt,
    bonus: null as (Pt & { bornAt: number }) | null,
    eaten: 0,
    bonuses: 0,
    combo: 0,
    comboDeadline: 0,
    maxCombo: 0,
    score: 0,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<Status>("idle");
  const submitted = useRef(false);

  const occupiedSet = useCallback(() => {
    const g = game.current;
    const s = new Set(g.snake.map((p) => `${p.x},${p.y}`));
    s.add(`${g.pellet.x},${g.pellet.y}`);
    if (g.bonus) s.add(`${g.bonus.x},${g.bonus.y}`);
    return s;
  }, []);

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g = game.current;

    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, DIM, DIM);

    // grid lines
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, DIM);
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(DIM, i * CELL + 0.5);
      ctx.stroke();
    }

    const tile = (x: number, y: number, fill: string, inset = 2) => {
      ctx.fillStyle = C.ink;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      ctx.fillStyle = fill;
      ctx.fillRect(
        x * CELL + inset,
        y * CELL + inset,
        CELL - inset * 2,
        CELL - inset * 2
      );
    };

    // pellet (the snack)
    tile(g.pellet.x, g.pellet.y, C.pellet, 5);

    // bonus snack — pulses, with a shrinking ring showing time left
    if (g.bonus) {
      const left = 1 - (now - g.bonus.bornAt) / BONUS_LIFETIME_MS;
      tile(g.bonus.x, g.bonus.y, C.bonus, 3);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const cx = g.bonus.x * CELL + CELL / 2;
      const cy = g.bonus.y * CELL + CELL / 2;
      ctx.arc(cx, cy, (CELL / 2 - 1) * Math.max(0, left), 0, Math.PI * 2);
      ctx.stroke();
    }

    // snake — head darker, with eyes
    g.snake.forEach((p, i) => {
      tile(p.x, p.y, i === 0 ? C.snakeHead : C.snake, i === 0 ? 1 : 2);
      if (i === 0) {
        ctx.fillStyle = C.paper;
        const e = CELL * 0.18;
        ctx.fillRect(p.x * CELL + CELL * 0.28, p.y * CELL + CELL * 0.3, e, e);
        ctx.fillRect(p.x * CELL + CELL * 0.62 - e, p.y * CELL + CELL * 0.3, e, e);
      }
    });
  }, []);

  const finish = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    statusRef.current = "over";
    setStatus("over");
    const g = game.current;
    if (submitted.current) return;
    submitted.current = true;
    if (g.score <= 0) return;
    try {
      const res = await api<{ isHighScore: boolean; isPersonalBest: boolean }>(
        "/api/arcade/scores",
        {
          method: "POST",
          body: {
            game: "snake",
            score: g.score,
            meta: { maxCombo: g.maxCombo, length: g.snake.length, bonuses: g.bonuses },
          },
        }
      );
      setResult({ isHighScore: res.isHighScore, isPersonalBest: res.isPersonalBest });
      router.refresh();
    } catch {
      // Score submission is best-effort; the run still counts on screen.
    }
  }, [router]);

  const step = useCallback(() => {
    const g = game.current;
    const now = performance.now();

    // combo decay
    if (g.combo > 0 && now > g.comboDeadline) {
      g.combo = 0;
      setMult(1);
      setComboPct(0);
    }

    // apply the next queued turn (one per tick — prevents self-kill on a
    // fast double-tap)
    if (g.queue.length) {
      const next = g.queue.shift()!;
      if (next.x !== -g.dir.x || next.y !== -g.dir.y) g.dir = next;
    }

    const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };

    // walls are deadly
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      draw(now);
      void finish();
      return;
    }
    // self collision (tail tip will move away unless we're about to grow,
    // so check against all but the last segment)
    const willGrow = head.x === g.pellet.x && head.y === g.pellet.y;
    const body = willGrow ? g.snake : g.snake.slice(0, -1);
    if (body.some((p) => p.x === head.x && p.y === head.y)) {
      draw(now);
      void finish();
      return;
    }

    g.snake.unshift(head);

    let ateSomething = false;
    if (willGrow) {
      ateSomething = true;
      g.eaten += 1;
      g.combo += 1;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.comboDeadline = now + COMBO_WINDOW_MS;
      g.score += PELLET_POINTS * multiplierFor(g.combo);
      g.pellet = randEmpty(occupiedSet());
      // golden snack every few normal snacks
      if (g.eaten % BONUS_EVERY === 0 && !g.bonus) {
        g.bonus = { ...randEmpty(occupiedSet()), bornAt: now };
      }
    } else {
      g.snake.pop();
    }

    // bonus snack: eat or expire
    if (g.bonus) {
      if (head.x === g.bonus.x && head.y === g.bonus.y) {
        ateSomething = true;
        g.bonuses += 1;
        g.combo += 1;
        g.maxCombo = Math.max(g.maxCombo, g.combo);
        g.comboDeadline = now + COMBO_WINDOW_MS;
        g.score += BONUS_POINTS * multiplierFor(g.combo);
        g.bonus = null;
      } else if (now - g.bonus.bornAt > BONUS_LIFETIME_MS) {
        g.bonus = null;
      }
    }

    if (ateSomething) {
      setScore(g.score);
      setMult(multiplierFor(g.combo));
      setLength(g.snake.length);
    }
    if (g.combo > 0) {
      setComboPct(Math.max(0, (g.comboDeadline - now) / COMBO_WINDOW_MS));
    }

    draw(now);
    timer.current = setTimeout(step, tickFor(g.snake.length));
  }, [draw, finish, occupiedSet]);

  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const mid = Math.floor(GRID / 2);
    const g = game.current;
    g.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    g.dir = DIRS.right;
    g.queue = [];
    g.bonus = null;
    g.eaten = 0;
    g.bonuses = 0;
    g.combo = 0;
    g.comboDeadline = 0;
    g.maxCombo = 0;
    g.score = 0;
    g.pellet = randEmpty(new Set(g.snake.map((p) => `${p.x},${p.y}`)));
    submitted.current = false;
    setResult(null);
    setScore(0);
    setMult(1);
    setComboPct(0);
    setLength(3);
    statusRef.current = "running";
    setStatus("running");
    draw(performance.now());
    timer.current = setTimeout(step, tickFor(3));
  }, [draw, step]);

  const togglePause = useCallback(() => {
    if (statusRef.current === "running") {
      if (timer.current) clearTimeout(timer.current);
      statusRef.current = "paused";
      setStatus("paused");
    } else if (statusRef.current === "paused") {
      statusRef.current = "running";
      setStatus("running");
      timer.current = setTimeout(step, tickFor(game.current.snake.length));
    }
  }, [step]);

  const turn = useCallback((d: keyof typeof DIRS) => {
    const g = game.current;
    const dir = DIRS[d];
    const ref = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    if (dir.x === -ref.x && dir.y === -ref.y) return; // no 180s
    if (dir.x === ref.x && dir.y === ref.y) return; // no dupes
    if (g.queue.length < 2) g.queue.push(dir);
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (statusRef.current === "idle" || statusRef.current === "over") start();
        else togglePause();
        return;
      }
      const d = KEY_DIR[e.key];
      if (!d) return;
      e.preventDefault();
      if (statusRef.current === "running") turn(d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, togglePause, turn]);

  // pause when the tab is hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && statusRef.current === "running") togglePause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [togglePause]);

  // cleanup
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // initial paint of the empty board
  useEffect(() => {
    const mid = Math.floor(GRID / 2);
    game.current.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    game.current.pellet = { x: mid + 4, y: mid };
    draw(performance.now());
  }, [draw]);

  // touch swipe
  const touch = useRef<Pt | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touch.current || statusRef.current !== "running") return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    e.preventDefault();
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    touch.current = { x: t.clientX, y: t.clientY };
  };

  return (
    <div className="space-y-3">
      {/* HUD */}
      <div className="flex items-stretch gap-2">
        <div className="brutal-card flex-1 px-3 py-2">
          <p className="brutal-label">Score</p>
          <p className="font-display text-2xl font-bold tabular-nums">{score}</p>
        </div>
        <div className="brutal-card flex-1 px-3 py-2">
          <p className="brutal-label">Multiplier</p>
          <p
            className={`font-display text-2xl font-bold tabular-nums ${
              mult > 1 ? "text-accent-magenta" : "text-ink/60"
            }`}
          >
            ×{mult}
          </p>
          <div className="mt-1 h-1.5 w-full border border-ink bg-paper">
            <div
              className="h-full bg-accent-magenta transition-[width] duration-100"
              style={{ width: `${Math.round(comboPct * 100)}%` }}
            />
          </div>
        </div>
        <div className="brutal-card flex-1 px-3 py-2">
          <p className="brutal-label">Length</p>
          <p className="font-display text-2xl font-bold tabular-nums">{length}</p>
        </div>
      </div>

      {/* Playfield */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={DIM}
          height={DIM}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          className="block w-full touch-none border-3 border-ink shadow-brutal"
          style={{ aspectRatio: "1 / 1", imageRendering: "pixelated" }}
        />

        {/* Overlays */}
        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/40 p-4 text-center">
            {status === "idle" && (
              <>
                <p className="font-display text-2xl font-bold text-white drop-shadow">
                  Feed the snake
                </p>
                <Button onClick={start} variant="green" className="animate-pop-in">
                  Start
                </Button>
              </>
            )}
            {status === "paused" && (
              <>
                <p className="font-display text-2xl font-bold text-white">Paused</p>
                <Button onClick={togglePause} variant="yellow">
                  Resume
                </Button>
              </>
            )}
            {status === "over" && (
              <div className="brutal-card animate-pop-in max-w-xs space-y-2 p-4">
                <p className="font-display text-2xl font-bold">Game over</p>
                <p className="font-mono text-sm">
                  You scored <span className="font-bold">{score}</span>
                </p>
                {result?.isHighScore && (
                  <p className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-xs font-bold uppercase">
                    <PixelIcon name="crown" size={14} /> New group record!
                  </p>
                )}
                {result && !result.isHighScore && result.isPersonalBest && (
                  <p className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-lime px-2 py-1 font-mono text-xs font-bold uppercase">
                    <PixelIcon name="star" size={14} /> Personal best
                  </p>
                )}
                <div className="pt-1">
                  <Button onClick={start} variant="green">
                    Play again
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls hint + pause */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase text-ink/40">
          Arrows / WASD · swipe on mobile · space to pause
        </p>
        {status === "running" && (
          <Button onClick={togglePause} variant="ghost" className="px-3 py-1 text-xs">
            Pause
          </Button>
        )}
      </div>
    </div>
  );
}
