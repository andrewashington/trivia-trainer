import { z } from "zod";

export const vaultEntryInput = z.object({
  siteName: z.string().trim().min(1, "Site name is required").max(200),
  siteUrl: z.string().trim().url().max(500).nullish().or(z.literal("").transform(() => null)),
  username: z.string().trim().min(1, "Username is required").max(300),
  password: z.string().min(1, "Password is required").max(1000),
  notes: z.string().trim().max(2000).nullish(),
});

export const vaultEntryPatch = z.object({
  siteName: z.string().trim().min(1).max(200).optional(),
  siteUrl: z.string().trim().url().max(500).nullish().or(z.literal("").transform(() => null)),
  username: z.string().trim().min(1).max(300).optional(),
  password: z.string().min(1).max(1000).optional(),
  notes: z.string().trim().max(2000).nullish(),
});
