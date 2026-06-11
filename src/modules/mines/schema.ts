import { z } from "zod";

export const startInput = z.object({
  bet: z.number().int(),
  mineCount: z.number().int().min(1).max(24),
});

export const revealInput = z.object({
  tile: z.number().int().min(0).max(24),
});

/** Client-safe view of a MinesGame row. `mines` is only included when status !== "active". */
export type MinesView = {
  id: string;
  stake: number;
  mineCount: number;
  revealed: number[];
  status: "active" | "busted" | "cashed";
  multiplier: number;
  nextMultiplier: number;
  coins: number;
  mines?: number[];
};
