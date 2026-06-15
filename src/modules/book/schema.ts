import { z } from "zod";

export const bookBetInput = z.object({
  marketId: z.string().min(1),
  outcome: z.enum(["Yes", "No"]),
  stake: z.number().int().min(1),
});

export const bookListQuery = z.object({
  q: z.string().trim().max(120).optional(),
});
