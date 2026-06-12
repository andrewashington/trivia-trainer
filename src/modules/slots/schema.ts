import { z } from "zod";

export const slotsInput = z.object({
  bet: z.number().int(),
});

export type SlotsInput = z.infer<typeof slotsInput>;

/** Shape returned by POST /api/slots after a spin. */
export type SlotsSpinResult = {
  reels: [number, number, number];
  multiplier: number;
  winnings: number;
  net: number;
  coins: number;
  jackpot: boolean;
};
