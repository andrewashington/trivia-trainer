import { z } from "zod";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
] as const;

/**
 * Images + PDFs only, validated by BOTH mime type and extension.
 * Everything else — and especially video — is hard-blocked.
 */
export const fileUploadRequest = z
  .object({
    filename: z.string().trim().min(1).max(300),
    mimeType: z.enum(ALLOWED_MIME_TYPES, {
      errorMap: () => ({ message: "Only images and PDFs are allowed." }),
    }),
    sizeBytes: z.number().int().positive(),
    sensitive: z.boolean().default(false),
  })
  .refine(
    (f) =>
      ALLOWED_EXTENSIONS.some((ext) => f.filename.toLowerCase().endsWith(ext)),
    { message: "File extension must be an image or PDF.", path: ["filename"] }
  );
