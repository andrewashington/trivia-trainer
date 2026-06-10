import { z } from "zod";
import type { IconName } from "@/components/icons";

export const PIN_CATEGORIES = [
  { value: "food", label: "Food", icon: "fish" },
  { value: "drink", label: "Drinks", icon: "bottle-wine" },
  { value: "outdoors", label: "Outdoors", icon: "tree-pine" },
  { value: "fun", label: "Fun", icon: "balloon" },
  { value: "home", label: "Homes", icon: "home" },
  { value: "other", label: "Other", icon: "map-pin" },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

export const pinIcon = (category: string): IconName =>
  PIN_CATEGORIES.find((c) => c.value === category)?.icon ?? "map-pin";

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
