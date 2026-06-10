/**
 * Tanks — deterministic artillery engine shared by the API (authoritative
 * hp/status) and the client (rendering + shot animation). A match is fully
 * described by its seed + the ordered list of turns; both sides replay the
 * same pure simulation, so nothing about the battlefield is stored.
 *
 * Determinism notes: transcendental results (sin/cos, noise) are rounded
 * before they enter the integration loop, and impacts are snapped to ints
 * before cratering/damage, so Node and every browser agree exactly.
 */

export const W = 600;
export const H = 400;
export const MAX_HP = 100;
export const TANK_W = 18;
export const TANK_H = 10;
export const TANK_HIT_R = 11; // proximity that counts as a direct hit

const GRAVITY = 0.12; // px / tick²
const POWER_SCALE = 0.095; // power (10..100) → launch speed px/tick
const WIND_ACCEL = 0.002; // wind unit → px/tick²
const MAX_TICKS = 2000;

export type WeaponKey = "shell" | "bigone" | "triple";

export type WeaponDef = {
  key: WeaponKey;
  label: string;
  /** crater radius, px */
  radius: number;
  /** damage on a dead-center hit */
  maxDamage: number;
  /** shots per player per match; null = unlimited */
  ammo: number | null;
  /** projectiles per shot, with angle spread between them (degrees) */
  count: number;
  spread: number;
};

export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  shell: { key: "shell", label: "Shell", radius: 22, maxDamage: 34, ammo: null, count: 1, spread: 0 },
  bigone: { key: "bigone", label: "Big One", radius: 42, maxDamage: 62, ammo: 1, count: 1, spread: 0 },
  triple: { key: "triple", label: "Triple", radius: 14, maxDamage: 17, ammo: 2, count: 3, spread: 5 },
};

export type Turn = {
  /** 0 = challenger, 1 = opponent */
  player: 0 | 1;
  weapon: WeaponKey;
  angle: number; // degrees, 0 = firing right along +x, 180 = firing left
  power: number; // 10..100
};

export type Tank = { x: number; y: number };

export type Projectile = {
  path: { x: number; y: number }[];
  /** int coords of the explosion; null if it sailed off the map */
  impact: { x: number; y: number } | null;
};

export type ShotResult = {
  projectiles: Projectile[];
  /** damage dealt to [challenger, opponent] by this shot */
  damage: [number, number];
};

export type GameState = {
  terrain: number[]; // surface y per x column (larger = lower)
  tanks: [Tank, Tank];
  hp: [number, number];
};

// --- deterministic RNG (mulberry32) ------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

// --- battlefield --------------------------------------------------------

/** Wind for the n-th turn of a match: -10..10, one decimal. */
export function windFor(seed: number, turnIndex: number): number {
  const r = rng(seed * 7919 + turnIndex * 104729 + 13);
  return round(r() * 20 - 10, 1);
}

/** Terrain + tank placement from the seed alone. */
export function initGame(seed: number): GameState {
  const r = rng(seed);
  // Rolling hills: three sine layers with random phase/amplitude, then a
  // gentle random walk, rounded to ints so every runtime carves the same.
  const a1 = 30 + r() * 40;
  const a2 = 12 + r() * 22;
  const a3 = 4 + r() * 10;
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  const p3 = r() * Math.PI * 2;
  const f1 = 1 + r() * 1.2;
  const f2 = 2.4 + r() * 2;
  const f3 = 6 + r() * 4;
  const base = H * 0.62 + r() * H * 0.1;

  const terrain: number[] = new Array(W);
  let drift = 0;
  for (let x = 0; x < W; x++) {
    drift += (r() - 0.5) * 1.4;
    drift *= 0.985;
    const t = (x / W) * Math.PI * 2;
    const y =
      base +
      round(Math.sin(t * f1 + p1), 4) * a1 +
      round(Math.sin(t * f2 + p2), 4) * a2 +
      round(Math.sin(t * f3 + p3), 4) * a3 +
      drift;
    terrain[x] = Math.round(Math.min(H - 24, Math.max(H * 0.35, y)));
  }

  const x0 = 50 + Math.floor(r() * 70);
  const x1 = W - 50 - Math.floor(r() * 70);
  // Flatten a small pad under each tank so it doesn't perch on a spike.
  for (const cx of [x0, x1]) {
    const pad = terrain[cx];
    for (let x = Math.max(0, cx - 12); x <= Math.min(W - 1, cx + 12); x++) terrain[x] = pad;
  }

  return {
    terrain,
    tanks: [
      { x: x0, y: terrain[x0] },
      { x: x1, y: terrain[x1] },
    ],
    hp: [MAX_HP, MAX_HP],
  };
}

// --- simulation ---------------------------------------------------------

function carveCrater(terrain: number[], cx: number, cy: number, radius: number) {
  const from = Math.max(0, cx - radius);
  const to = Math.min(W - 1, cx + radius);
  for (let x = from; x <= to; x++) {
    const dx = x - cx;
    const depth = Math.round(Math.sqrt(radius * radius - dx * dx));
    // Surface drops to the bottom edge of the blast circle (if deeper).
    terrain[x] = Math.min(H - 4, Math.max(terrain[x], cy + depth));
  }
}

function explode(
  state: GameState,
  cx: number,
  cy: number,
  weapon: WeaponDef,
  damage: [number, number]
) {
  // Damage both tanks by proximity (self-damage is real — aim carefully).
  const falloff = weapon.radius * 1.7;
  for (const i of [0, 1] as const) {
    const t = state.tanks[i];
    const d = Math.sqrt((t.x - cx) ** 2 + (t.y - TANK_H / 2 - cy) ** 2);
    if (d < falloff) {
      damage[i] += Math.max(1, Math.round(weapon.maxDamage * (1 - d / falloff)));
    }
  }
  carveCrater(state.terrain, cx, cy, weapon.radius);
  // Ground may have been blown out from under a tank — it settles down.
  for (const t of state.tanks) t.y = state.terrain[t.x];
}

/**
 * Fire one turn against the given state. Mutates `state` (terrain, tank
 * resettling, hp) and returns the flight paths for animation.
 */
function fireProjectiles(
  state: GameState,
  turn: Turn & { wind?: number },
  weapon: WeaponDef,
  shooter: Tank
): ShotResult {
  const damage: [number, number] = [0, 0];
  const projectiles: Projectile[] = [];
  const windAx = (turn.wind ?? 0) * WIND_ACCEL;

  for (let p = 0; p < weapon.count; p++) {
    const spreadOffset = (p - (weapon.count - 1) / 2) * weapon.spread;
    const rad = ((turn.angle + spreadOffset) * Math.PI) / 180;
    const speed = turn.power * POWER_SCALE;
    // Round launch velocity so the integration loop is pure +/* from here.
    let vx = round(Math.cos(rad) * speed, 4);
    let vy = round(-Math.sin(rad) * speed, 4);
    let x = shooter.x + round(Math.cos(rad), 4) * 14;
    let y = shooter.y - TANK_H - 4 + round(-Math.sin(rad), 4) * 14;

    const path: { x: number; y: number }[] = [{ x, y }];
    let impact: { x: number; y: number } | null = null;

    for (let tick = 0; tick < MAX_TICKS; tick++) {
      vx += windAx;
      vy += GRAVITY;
      x += vx;
      y += vy;
      path.push({ x, y });

      if (x < 0 || x >= W || y > H) break; // off the map — a dud

      const xi = Math.round(x);
      // Direct hit on a tank (only once it's clear of the muzzle).
      if (tick > 3) {
        const hitTank = state.tanks.find(
          (t) => Math.abs(t.x - x) < TANK_HIT_R && Math.abs(t.y - TANK_H / 2 - y) < TANK_HIT_R
        );
        if (hitTank) {
          impact = { x: xi, y: Math.round(y) };
          break;
        }
      }
      if (xi >= 0 && xi < W && y >= state.terrain[xi]) {
        impact = { x: xi, y: Math.round(Math.max(y, state.terrain[xi])) };
        break;
      }
    }

    if (impact) explode(state, impact.x, impact.y, weapon, damage);
    projectiles.push({ path, impact });
  }

  state.hp[0] = Math.max(0, state.hp[0] - damage[0]);
  state.hp[1] = Math.max(0, state.hp[1] - damage[1]);
  return { projectiles, damage };
}

/** Fire the n-th turn (wind derived from seed + index). */
export function applyTurn(state: GameState, seed: number, index: number, turn: Turn): ShotResult {
  const weapon = WEAPONS[turn.weapon];
  return fireProjectiles(state, { ...turn, wind: windFor(seed, index) }, weapon, state.tanks[turn.player]);
}

/** Rebuild the battlefield by replaying every turn from the seed. */
export function replay(seed: number, turns: Turn[]): GameState {
  const state = initGame(seed);
  turns.forEach((t, i) => applyTurn(state, seed, i, t));
  return state;
}

/** Who fires first: derived from the seed so it's fair-ish and stateless. */
export function firstPlayer(seed: number): 0 | 1 {
  return (seed & 1) as 0 | 1;
}

/** Shots of `weapon` the player has left, given the turns so far. */
export function ammoLeft(turns: Turn[], player: 0 | 1, weapon: WeaponKey): number | null {
  const def = WEAPONS[weapon];
  if (def.ammo === null) return null;
  const used = turns.filter((t) => t.player === player && t.weapon === weapon).length;
  return Math.max(0, def.ammo - used);
}
