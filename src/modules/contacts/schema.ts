import { z } from "zod";

export const relatedPartyInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  relation: z.string().trim().max(60).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
});

export const contactCardInput = z.object({
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  // "1990-04-23" — date only, no time zone games.
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish()
    .or(z.literal("").transform(() => null)),
  address: z.string().trim().max(1000).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  relatedParties: z.array(relatedPartyInput).max(10).default([]),
});
