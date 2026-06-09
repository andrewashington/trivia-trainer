import { z } from "zod";

export const eventInput = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(10_000).nullish(),
    location: z.string().trim().max(300).nullish(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date().nullish(),
  })
  .refine((e) => !e.endAt || e.endAt > e.startAt, {
    message: "End must be after start",
    path: ["endAt"],
  });

export const eventPatch = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).nullish(),
    location: z.string().trim().max(300).nullish(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().nullish(),
  });

export const rsvpInput = z.object({
  status: z.enum(["going", "maybe", "no"]),
});
