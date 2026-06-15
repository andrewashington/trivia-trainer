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

// Discord feature settings (AppConfig "discord.settings"). tipsEnabled gates
// coin transfers, so it's an explicit toggle; digest day/hour drive the digest.
export const discordSettingsPut = z.object({
  tipsEnabled: z.boolean(),
  dropsEnabled: z.boolean(),
  aiEnabled: z.boolean(),
  archiveEnabled: z.boolean(),
  rewardsEnabled: z.boolean(),
  digestDay: z.coerce.number().int().min(0).max(6),
  digestHour: z.coerce.number().int().min(0).max(23),
  aiModel: z.string().trim().max(100),
});

// The Discord admin tab saves the muted-event set and the feature settings together.
export const discordAdminPut = z.object({
  disabled: z.array(z.string().min(1)).max(200),
  settings: discordSettingsPut,
});

// AI assistant admin: tuning fields (merged into discord.settings) + memory CRUD.
export const aiSettingsPut = z.object({
  aiSystemPrompt: z.string().max(4000),
  aiPromptAssistant: z.string().max(8000),
  aiPromptSpontaneous: z.string().max(8000),
  aiPromptRerank: z.string().max(8000),
  aiSemanticSearch: z.boolean(),
  aiRerank: z.boolean(),
  aiSearchLimit: z.coerce.number().int().min(1).max(30),
  aiMaxSteps: z.coerce.number().int().min(1).max(12),
  aiMaxTokens: z.coerce.number().int().min(200).max(8000),
  aiModel: z.string().trim().max(100),
  spontaneousEnabled: z.boolean(),
});

export const memoryCreate = z.object({
  fact: z.string().trim().min(1).max(600),
  subject: z.string().trim().max(120).optional(),
});

// Knob overrides for one game: { [knobId]: number | boolean | number[] }.
export const knobsPut = z.object({
  game: z.string().min(1).max(40),
  values: z.record(z.union([z.number(), z.boolean(), z.array(z.number())])),
});
