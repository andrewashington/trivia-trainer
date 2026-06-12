import { z } from "zod";

export const CLOCK_CHOICES = [1, 6, 24] as const;

export const createTableInput = z.object({
  name: z.string().trim().min(1, "Name required.").max(40),
  smallBlind: z.number().int().positive().max(1000).optional(),
  bigBlind: z.number().int().positive().max(2000).optional(),
  clockHours: z
    .number()
    .int()
    .refine((v) => (CLOCK_CHOICES as readonly number[]).includes(v), "Clock must be 1, 6, or 24 hours."),
});

export const sitInput = z.object({
  buyIn: z.number().int().positive().max(10_000_000),
});

export const actionInput = z.object({
  kind: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: z.number().int().nonnegative().optional(),
});

export type CreateTableInput = z.infer<typeof createTableInput>;
export type SitInput = z.infer<typeof sitInput>;
export type ActionInput = z.infer<typeof actionInput>;
