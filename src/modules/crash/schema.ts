import { z } from "zod";

/** Body for starting a new Crash round. */
export const startInput = z.object({
  bet: z.number().int(),
});
