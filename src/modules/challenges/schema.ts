import { z } from "zod";

export const challengeInput = z.object({
  title: z.string().trim().min(1, "Name the challenge!").max(200),
  description: z.string().trim().max(2000).nullish(),
  // ISO datetime, must be in the future (checked in the route).
  deadline: z.string().datetime().nullish(),
});

export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;

/** Entry proof: text and/or a photo — at least one required. */
export const entryInput = z
  .object({
    text: z.string().trim().max(2000).nullish(),
    photo: z
      .object({
        filename: z.string().trim().min(1).max(300),
        mimeType: z.enum(PHOTO_MIME_TYPES, {
          errorMap: () => ({ message: "Proof photos must be images." }),
        }),
        sizeBytes: z.number().int().positive(),
      })
      .refine(
        (f) => PHOTO_EXTENSIONS.some((ext) => f.filename.toLowerCase().endsWith(ext)),
        { message: "File extension must be an image.", path: ["filename"] }
      )
      .nullish(),
  })
  .refine((e) => (e.text && e.text.length > 0) || e.photo, {
    message: "Bring proof: some words, a photo, or both.",
    path: ["text"],
  });

export const voteInput = z.object({
  // null clears your vote.
  entryId: z.string().min(1).nullable(),
});

/** Coins paid to the most-voted entry when a challenge settles. */
export const WINNER_COINS = 25;
