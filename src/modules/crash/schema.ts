import { z } from "zod";

/** Body for starting a new Crash round. */
export const startInput = z.object({
  bet: z.number().int(),
});

/**
 * Body for cashing out. `multiplier` is the value the client was actually
 * displaying at the moment of the tap — the server pays this (bounded by
 * its own clock so it can't be inflated) so the payout always matches what
 * the player saw.
 */
export const cashoutInput = z.object({
  multiplier: z.number().positive(),
});
