import { z } from "zod";

export const PIN_CATEGORIES = [
  { value: "food", label: "Food", emoji: "🌮" },
  { value: "drink", label: "Drinks", emoji: "🍺" },
  { value: "outdoors", label: "Outdoors", emoji: "🌲" },
  { value: "fun", label: "Fun", emoji: "🎳" },
  { value: "home", label: "Homes", emoji: "🏠" },
  { value: "other", label: "Other", emoji: "📍" },
] as const;

export const pinEmoji = (category: string): string =>
  PIN_CATEGORIES.find((c) => c.value === category)?.emoji ?? "📍";

export const mapPinInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.enum(["food", "drink", "outdoors", "fun", "home", "other"]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(400).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export const geocodeQuery = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(200),
});
