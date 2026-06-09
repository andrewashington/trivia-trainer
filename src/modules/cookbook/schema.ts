import { z } from "zod";

export const recipeInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(50_000),
  imageKey: z.string().max(500).nullish(),
});

export const recipePatch = recipeInput.partial();

export const recipeImageRequest = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});
