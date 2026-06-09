import { z } from "zod";

export const memberAdd = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1, "Name is required").max(100),
});

export const memberPatch = z.object({
  role: z.enum(["member", "admin"]).optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
});
