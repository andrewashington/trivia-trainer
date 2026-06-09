import { z } from "zod";

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(1000)
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link");

export const wishlistItemInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  url: httpUrl.nullish().or(z.literal("").transform(() => null)),
  imageUrl: httpUrl.nullish().or(z.literal("").transform(() => null)),
  siteName: z.string().trim().max(100).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export const wishlistPreviewRequest = z.object({
  url: httpUrl,
});
