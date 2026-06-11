import { z } from "zod";

export const CARD_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
] as const;

export const deckInput = z.object({
  title: z.string().trim().min(1).max(100),
  detail: z.string().trim().max(300).optional().nullable(),
  cards: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        imageUrl: z.string().trim().url().max(500).optional().nullable(),
        /** Attached upload — the API answers with a presigned PUT per card. */
        image: z
          .object({
            filename: z.string().trim().min(1).max(300),
            mimeType: z.enum(CARD_IMAGE_MIME_TYPES, {
              errorMap: () => ({ message: "Card images must be images." }),
            }),
            sizeBytes: z.number().int().positive(),
          })
          .optional()
          .nullable(),
      })
    )
    .min(2, "A deck needs at least 2 cards.")
    .max(100, "Easy — 100 cards max."),
});

export const voteInput = z.object({
  verdict: z.enum(["smash", "pass"]),
});

export type DeckInput = z.infer<typeof deckInput>;
export type Verdict = z.infer<typeof voteInput>["verdict"];
