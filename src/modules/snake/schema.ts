import { z } from "zod";

/**
 * Shared Snake tuning + score contract. The client runs the game and
 * reports a final score; the server trusts it (personal-use app) but
 * sanity-caps it so a fat-fingered or replayed request can't poison the
 * board.
 */

export const GRID = 17; // cells per side — square playfield
export const BASE_TICK_MS = 140; // starting step delay
export const MIN_TICK_MS = 62; // fastest the snake ever goes
export const TICK_STEP_MS = 6; // shaved off per speed level
export const CELLS_PER_LEVEL = 3; // every N segments grown = one level faster

export const PELLET_POINTS = 10; // base score per normal snack
export const BONUS_POINTS = 50; // base score for the golden snack
export const BONUS_EVERY = 5; // golden snack appears every N normal snacks
export const BONUS_LIFETIME_MS = 6000; // how long the golden snack lingers

export const COMBO_WINDOW_MS = 2600; // eat again within this to keep the combo
export const MAX_MULTIPLIER = 5;

/** Combo count → score multiplier (×1 up to ×5). */
export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, combo - 1) / 2));
}

/** Step delay for a given snake length — faster as you grow, floored. */
export function tickFor(length: number): number {
  const level = Math.floor(length / CELLS_PER_LEVEL);
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - level * TICK_STEP_MS);
}

export const scoreInput = z.object({
  game: z.literal("snake"),
  sessionId: z.string().cuid(),
  score: z.number().int().min(0).max(1_000_000),
  meta: z
    .object({
      maxCombo: z.number().int().min(0).max(10_000).optional(),
      length: z.number().int().min(0).max(GRID * GRID).optional(),
      bonuses: z.number().int().min(0).max(10_000).optional(),
    })
    .optional(),
});

export type ScoreInput = z.infer<typeof scoreInput>;
