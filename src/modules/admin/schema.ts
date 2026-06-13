import { z } from "zod";

export const memberAdd = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1, "Name is required").max(100),
});

export const memberPatch = z.object({
  role: z.enum(["member", "admin"]).optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
});

// A hand-credited (or docked) coin adjustment. amount may be negative; the
// note is required so every off-band balance change is self-documenting in
// the ledger.
export const coinAdjust = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().int().refine((n) => n !== 0, "Amount can't be zero."),
  note: z.string().trim().min(1, "Add a note — the ledger remembers.").max(140),
});

// One coin-campaign card. Mirrors the CoinReward shape in coinRewards.ts
// plus an `enabled` flag so a promo can be paused without deleting it.
export const promoSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "lowercase, digits and dashes only"),
  amount: z.coerce.number().int().min(1).max(1_000_000),
  cadence: z.enum(["once", "daily"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(400),
  cta: z.string().trim().min(1).max(40),
  ledgerLabel: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
});

export const promosPut = z.object({
  rewards: z.array(promoSchema).max(50),
});

export const discordFeedsPut = z.object({
  disabled: z.array(z.string().min(1)).max(200),
});

// Knob overrides for one game: { [knobId]: number | boolean | number[] }.
export const knobsPut = z.object({
  game: z.string().min(1).max(40),
  values: z.record(z.union([z.number(), z.boolean(), z.array(z.number())])),
});
