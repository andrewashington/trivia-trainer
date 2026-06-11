import { z } from "zod";

export const limboInput = z.object({
  bet: z.number().int(),
  target: z.number(),
});

export type LimboInput = z.infer<typeof limboInput>;
