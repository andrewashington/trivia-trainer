import { z } from "zod";

/** The six tiers, best to worst. Index = numeric score for consensus. */
export const TIERS = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIERS)[number];

/** Classic tiermaker row colors, S red down to F gray. */
export const TIER_COLORS: Record<Tier, string> = {
  S: "#FF7F7E",
  A: "#FFBF7F",
  B: "#FFDF80",
  C: "#FFFF7F",
  D: "#BFFF7F",
  F: "#B3B3B3",
};

export const tierListInput = z.object({
  title: z.string().trim().min(1, "Name the list!").max(120),
  description: z.string().trim().max(1000).nullish(),
  items: z
    .array(z.string().trim().min(1).max(120))
    .min(2, "Need at least 2 things to rank.")
    .max(50, "50 items max — this isn't a census."),
});

export const rankingInput = z.object({
  placements: z
    .array(
      z.object({
        itemId: z.string().min(1),
        tier: z.enum(TIERS),
        position: z.number().int().min(0).max(999),
      })
    )
    .min(1, "Rank at least one item."),
});

/** Average tier across rankers (S=0..F=5), rounded to the nearest tier. */
export function consensusTier(tiers: Tier[]): Tier | null {
  if (tiers.length === 0) return null;
  const avg = tiers.reduce((sum, t) => sum + TIERS.indexOf(t), 0) / tiers.length;
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, Math.round(avg)))];
}
