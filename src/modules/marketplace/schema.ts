import { z } from "zod";

export const listingInput = z.object({
  title: z.string().trim().min(1, "What is it?").max(200),
  description: z.string().trim().max(2000).nullish(),
  // null/absent = FREE
  priceCents: z.number().int().min(0).max(100_000_00).nullish(),
  delivery: z.enum(["pickup", "delivery", "either"]),
  imageKey: z.string().max(500).nullish(),
});

export const listingPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullish(),
  priceCents: z.number().int().min(0).max(100_000_00).nullish(),
  delivery: z.enum(["pickup", "delivery", "either"]).optional(),
  imageKey: z.string().max(500).nullish(),
  // "gone" = sold/given away; "available" relists (clears any claim).
  status: z.enum(["available", "gone"]).optional(),
});

export const listingImageRequest = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

export const DELIVERY_LABELS: Record<string, string> = {
  pickup: "🚪 Pickup",
  delivery: "🚗 Delivery",
  either: "🚪🚗 Either",
};

export function formatPrice(priceCents: number | null): string {
  if (priceCents === null || priceCents === 0) return "FREE";
  return `$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}`;
}
