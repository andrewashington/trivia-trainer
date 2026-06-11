import { z } from "zod";

export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;

/** Images ONLY — validated by both mime type and extension. */
export const photoUploadRequest = z
  .object({
    filename: z.string().trim().min(1).max(300),
    mimeType: z.enum(PHOTO_MIME_TYPES, {
      errorMap: () => ({ message: "Photobook takes images only." }),
    }),
    sizeBytes: z.number().int().positive(),
    caption: z.string().trim().max(500).optional(),
    sensitive: z.boolean().default(false),
    taggedUserIds: z.array(z.string().min(1)).max(50).default([]),
  })
  .refine(
    (f) => PHOTO_EXTENSIONS.some((ext) => f.filename.toLowerCase().endsWith(ext)),
    { message: "File extension must be an image.", path: ["filename"] }
  );
