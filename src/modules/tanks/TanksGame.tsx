"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiCelebrate } from "@/lib/confetti";
import { Avatar, Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import {
  H,
  MAX_HP,
  TANK_H,
  TANK_W,
  W,
  WEAPONS,
  ammoLeft,
  applyTurn,
  replay,
  windFor,
  type GameState,
  type ShotResult,
  type Turn,
  type WeaponKey,
} from "@/modules/tanks/engine";
import type { TanksGamePayload } from "@/modules/tanks/server";

// Palette — the brutalist tokens from tailwind.config.ts.
const C = {
  paper: "#F4F1EA",
  ink: "#101010",
  ground: "#B5E631", // accent-lime
  groundDeep: "#0B9E63", // accent-forest
  p0: "#2563FF", // challenger — accent-blue
  p1: "#FF4D2E", // opponent — accent-red
  shell: "#101010",
  boom: "#FF9F1C", // accent-orange
  boomCore: "#FFD60A", // accent-yellow
  trail: "rgba(16,16,16,0.25)",
};

const POLL_MS = 4000;
const TICKS_PER_FRAME = 4;
const BOOM_FRAMES = 14;

type Anim = {
  pre: GameState;
  result: ShotResult;
  post: GameState;
  turn: Turn;
  proj: number; // which projectile is flying
  tick: number; // index into its path
  boom: number; // explosion frame, -1 while flying
};

function cloneState(s: GameState): GameState {
  return { terrain: [...s.terrain], tanks: [{ ...s.tanks[0] }, { ...s.tanks[1] }], hp: [...s.hp] };
}

export function TanksGame({ initial, meId }: { initial: TanksGamePayload; meId: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [game, setGame] = useState(initial);
  // How many turns are baked into the rendered battlefield; anything
  // beyond it gets animated, then baked.
  const [shownCount, setShownCount] = useState(initial.turns.length);
  const stateRef = useRef<GameState>(replay(initial.seed, initial.turns));
  const animRef = useRef<Anim | null>(null);
  const rafRef = useRef<number>(0);

  // --- aiming controls ---
  const meIdx: 0 | 1 | null =
    initial.challenger.id === meId ? 0 : initial.opponent.id === meId ? 1 : null;
  const [angle, setAngle] = useState(meIdx === 1 ? 120 : 60);
  const [power, setPower] = useState(65);
  const [weapon, setWeapon] = useState<WeaponKey>("shell");
  const [firing, setFiring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const celebrated = useRef(initial.status === "finished");

  const myTurn = game.status === "active" && meIdx !== null && game.currentPlayerId === meId;
  const wind = windFor(game.seed, game.turns.length);
  const players = [game.challenger, game.opponent] as const;

  // --- drawing -----------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const anim = animRef.current;
    const s = anim ? anim.pre : stateRef.current;

    // sky
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);

    // terrain
    ctx.fillStyle = C.ground;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x < W; x++) ctx.lineTo(x, s.terrain[x]);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    // deeper soil band + chunky surface line
    ctx.fillStyle = C.groundDeep;
    for (let x = 0; x < W; x += 2) ctx.fillRect(x, Math.min(H, s.terrain[x] + 26), 2, H);
    ctx.fillStyle = C.ink;
    for (let x = 0; x < W; x += 2) ctx.fillRect(x, s.terrain[x], 2, 3);

    // tanks
    ([0, 1] as const).forEach((i) => {
      const t = s.tanks[i];
      const dead = s.hp[i] <= 0;
      const color = dead ? "rgba(16,16,16,0.35)" : i === 0 ? C.p0 : C.p1;
      // barrel: my live aim on my tank, otherwise the player's last angle
      let barrelDeg = i === 0 ? 60 : 120;
      const lastOwn = [...game.turns].reverse().find((tn) => tn.player === i);
      if (lastOwn) barrelDeg = lastOwn.angle;
      if (i === meIdx && myTurn && !anim) barrelDeg = angle;
      const rad = (barrelDeg * Math.PI) / 180;
      const bx = t.x + Math.cos(rad) * 15;
      const by = t.y - TANK_H - 2 - Math.sin(rad) * 15;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - TANK_H + 1);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // body + turret, brutalist rectangles with ink outline
      ctx.fillStyle = C.ink;
      ctx.fillRect(t.x - TANK_W / 2 - 2, t.y - TANK_H - 2, TANK_W + 4, TANK_H + 4);
      ctx.fillStyle = color;
      ctx.fillRect(t.x - TANK_W / 2, t.y - TANK_H, TANK_W, TANK_H);
      ctx.fillStyle = C.ink;
      ctx.fillRect(t.x - 4, t.y - TANK_H - 5, 8, 5);
      // hp pips above
      const hpW = 26;
      ctx.fillStyle = C.ink;
      ctx.fillRect(t.x - hpW / 2 - 1, t.y - TANK_H - 15, hpW + 2, 6);
      ctx.fillStyle = C.paper;
      ctx.fillRect(t.x - hpW / 2, t.y - TANK_H - 14, hpW, 4);
      ctx.fillStyle = color;
      ctx.fillRect(t.x - hpW / 2, t.y - TANK_H - 14, Math.round((hpW * s.hp[i]) / MAX_HP), 4);
    });

    // in-flight shot + trail + explosion
    if (anim) {
      const proj = anim.result.projectiles[anim.proj];
      const upto = Math.min(anim.tick, proj.path.length - 1);
      ctx.fillStyle = C.trail;
      for (let i = 0; i < upto; i += 3) {
        const p = proj.path[i];
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      if (anim.boom < 0) {
        const p = proj.path[upto];
        ctx.fillStyle = C.ink;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      } else if (proj.impact) {
        const def = WEAPONS[anim.turn.weapon];
        const r = (def.radius * 1.25 * (anim.boom + 1)) / BOOM_FRAMES;
        ctx.fillStyle = C.boom;
        ctx.beginPath();
        ctx.arc(proj.impact.x, proj.impact.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.boomCore;
        ctx.beginPath();
        ctx.arc(proj.impact.x, proj.impact.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [angle, game.turns, meIdx, myTurn]);

  // --- animation loop ------------------------------------------------------

  const pump = useCallback(() => {
    const anim = animRef.current;
    if (!anim) return;
    const proj = anim.result.projectiles[anim.proj];
    if (anim.boom < 0) {
      anim.tick += TICKS_PER_FRAME;
      if (anim.tick >= proj.path.length - 1) {
        anim.tick = proj.path.length - 1;
        anim.boom = proj.impact ? 0 : BOOM_FRAMES; // duds skip the fireball
      }
    } else {
      anim.boom += 1;
      if (anim.boom >= BOOM_FRAMES) {
        if (anim.proj < anim.result.projectiles.length - 1) {
          anim.proj += 1;
          anim.tick = 0;
          anim.boom = -1;
        } else {
          // bake the post-shot battlefield
          stateRef.current = anim.post;
          animRef.current = null;
          setShownCount((n) => n + 1);
          draw();
          return;
        }
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(pump);
  }, [draw]);

  // Animate any turns we haven't shown yet, one at a time.
  useEffect(() => {
    if (animRef.current || shownCount >= game.turns.length) {
      draw();
      return;
    }
    const baked = game.turns.slice(0, shownCount);
    const pre = replay(game.seed, baked);
    const post = cloneState(pre);
    const turn = game.turns[shownCount];
    const result = applyTurn(post, game.seed, shownCount, turn);
    animRef.current = { pre, result, post, turn, proj: 0, tick: 0, boom: -1 };
    rafRef.current = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(rafRef.current);
  }, [shownCount, game, pump, draw]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Win fanfare, once everything has played out on screen.
  useEffect(() => {
    if (
      game.status === "finished" &&
      shownCount >= game.turns.length &&
      !celebrated.current
    ) {
      celebrated.current = true;
      if (game.winnerId === meId) confettiCelebrate();
      router.refresh();
    }
  }, [game, shownCount, meId, router]);

  // --- polling for the opponent's move ------------------------------------

  useEffect(() => {
    if (game.status !== "active" || myTurn) return;
    const t = setInterval(async () => {
      try {
        const res = await api<{ game: TanksGamePayload }>(`/api/arcade/tanks/${game.id}`);
        if (res.game.turnCount !== game.turnCount || res.game.status !== game.status) {
          setGame(res.game);
        }
      } catch {
        // transient — next poll will catch up
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [game, myTurn]);

  // --- actions -------------------------------------------------------------

  const fire = async () => {
    if (!myTurn || firing) return;
    setFiring(true);
    setError(null);
    try {
      const res = await api<{ game: TanksGamePayload }>(`/api/arcade/tanks/${game.id}/fire`, {
        method: "POST",
        body: { weapon, angle, power },
      });
      setGame(res.game);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The shot misfired. Try again.");
    } finally {
      setFiring(false);
    }
  };

  const resign = async () => {
    if (!window.confirm("Wave the white flag? Your opponent takes the win.")) return;
    try {
      const res = await api<{ game: TanksGamePayload }>(`/api/arcade/tanks/${game.id}`, {
        method: "DELETE",
      });
      setGame(res.game);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resign.");
    }
  };

  const animating = shownCount < game.turns.length;
  const settled = game.status === "finished" && !animating;
  const winnerName =
    game.winnerId === game.challenger.id
      ? game.challenger.displayName
      : game.winnerId === game.opponent.id
        ? game.opponent.displayName
        : null;
  const ammo = (k: WeaponKey) =>
    meIdx === null ? null : ammoLeft(game.turns, meIdx, k);

  return (
    <div className="space-y-3">
      {/* Player cards */}
      <div className="grid grid-cols-2 gap-2">
        {players.map((p, i) => {
          const active = game.status === "active" && game.currentPlayerId === p.id;
          return (
            <div
              key={p.id}
              className={`brutal-card flex items-center gap-2.5 px-3 py-2 ${
                active ? (i === 0 ? "bg-accent-blue/15" : "bg-accent-red/15") : ""
              }`}
            >
              <Link href={`/people/${p.id}`} className="shrink-0 no-underline">
                <Avatar name={p.displayName} src={p.avatarUrl} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold leading-tight">
                  <Link
                    href={`/people/${p.id}`}
                    className="text-ink no-underline hover:text-accent-blue"
                  >
                    {p.displayName}
                  </Link>
                  {p.id === meId && <span className="text-ink/40"> (you)</span>}
                </p>
                <div className="mt-1 h-2 w-full border-2 border-ink bg-paper">
                  <div
                    className={`h-full ${i === 0 ? "bg-accent-blue" : "bg-accent-red"}`}
                    style={{ width: `${Math.round((game.hp[i] / MAX_HP) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="shrink-0 font-mono text-xs font-bold tabular-nums">{game.hp[i]}</span>
            </div>
          );
        })}
      </div>

      {/* Battlefield */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block w-full border-3 border-ink bg-paper shadow-brutal"
          style={{ aspectRatio: `${W} / ${H}`, imageRendering: "pixelated" }}
        />
        {/* wind flag */}
        <div className="absolute left-2 top-2 border-2 border-ink bg-card px-2 py-1 font-mono text-[11px] font-bold uppercase shadow-brutal-sm">
          Wind{" "}
          {wind === 0 ? "·calm·" : `${wind < 0 ? "←" : ""} ${Math.abs(wind)} ${wind > 0 ? "→" : ""}`}
        </div>
        <div className="absolute right-2 top-2 border-2 border-ink bg-card px-2 py-1 font-mono text-[11px] font-bold uppercase shadow-brutal-sm">
          Turn {game.turnCount + 1}
        </div>

        {settled && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40 p-4">
            <div className="brutal-card animate-pop-in space-y-2 p-5 text-center">
              <p className="font-display text-2xl font-bold">
                {winnerName ? `${winnerName} wins!` : "It's over."}
              </p>
              <p className="font-mono text-xs uppercase text-ink/60">
                {game.turnCount} shot{game.turnCount === 1 ? "" : "s"} fired
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {meIdx !== null && game.status === "active" && (
        <div className="brutal-card space-y-3 p-3">
          {myTurn && !animating ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(WEAPONS) as WeaponKey[]).map((k) => {
                  const def = WEAPONS[k];
                  const left = ammo(k);
                  const out = left !== null && left <= 0;
                  return (
                    <button
                      key={k}
                      onClick={() => !out && setWeapon(k)}
                      disabled={out}
                      className={`brutal-press border-2 border-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase shadow-brutal-sm disabled:opacity-40 ${
                        weapon === k ? "bg-accent-orange" : "bg-card"
                      }`}
                    >
                      {def.label}
                      {left !== null && <span className="ml-1 text-ink/50">×{left}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="brutal-label">
                    Angle · {angle}°{" "}
                    <span className="normal-case text-ink/40">(0 → right, 180 → left)</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    value={angle}
                    onChange={(e) => setAngle(Number(e.target.value))}
                    className="w-full accent-ink"
                  />
                </label>
                <label className="block">
                  <span className="brutal-label">Power · {power}</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={power}
                    onChange={(e) => setPower(Number(e.target.value))}
                    className="w-full accent-ink"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button onClick={fire} disabled={firing} variant="danger">
                  {firing ? "Firing…" : "Fire!"}
                </Button>
                <button
                  onClick={resign}
                  className="font-mono text-[11px] uppercase text-ink/40 underline"
                >
                  resign
                </button>
              </div>
              {error && (
                <p className="border-2 border-ink bg-accent-red/15 px-2 py-1 font-mono text-xs">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-mono text-xs uppercase text-ink/60">
                <PixelIcon name="clock" size={14} />
                {animating
                  ? "Incoming…"
                  : `Waiting on ${players[game.currentPlayerId === players[0].id ? 0 : 1].displayName}`}
              </p>
              <button
                onClick={resign}
                className="font-mono text-[11px] uppercase text-ink/40 underline"
              >
                resign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
