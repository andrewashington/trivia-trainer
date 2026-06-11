import { db } from "@/lib/db";
import { minesMultiplier } from "@/modules/arcade/bank";
import type { MinesView } from "@/modules/mines/schema";

type MinesGameRow = {
  id: string;
  stake: number;
  mineCount: number;
  mines: number[];
  revealed: number[];
  status: string;
  multiplier: number;
};

/**
 * Map a MinesGame DB row to a client-safe view.
 * CRITICAL: `mines` is only included when status !== "active".
 */
export function toMinesView(game: MinesGameRow, coins: number): MinesView {
  const status = game.status as "active" | "busted" | "cashed";
  const nextMultiplier = minesMultiplier(game.mineCount, game.revealed.length + 1);
  const view: MinesView = {
    id: game.id,
    stake: game.stake,
    mineCount: game.mineCount,
    revealed: game.revealed,
    status,
    multiplier: game.multiplier,
    nextMultiplier,
    coins,
  };
  // Only expose mine positions once the round is over
  if (status !== "active") {
    view.mines = game.mines;
  }
  return view;
}

/** Fetch the current user's coin balance. */
export async function getUserCoins(userId: string): Promise<number> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { coins: true },
  });
  return user.coins;
}
