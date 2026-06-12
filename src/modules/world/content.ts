// server-side only (imports db) — keep out of client components
import { db } from "@/lib/db";
import { SHOP_OUTFITS, type ShopOutfit } from "./cosmetics";
import { DEFAULT_HOUSE_PRICE } from "./houses";

/**
 * World game-data: code ships the defaults, the WorldConfig table holds
 * admin overrides (edited in /world/admin), and these helpers merge the
 * two. Game/shop code should ALWAYS read through here — never the raw
 * defaults — so admin edits take effect without a deploy.
 */

// ── Dialog ────────────────────────────────────────────────────────────
// npc object name → lines. "shopkeep:shop" is the rotating line in the
// shop modal header (panel NPCs don't chat in-scene).
export type WorldDialog = Record<string, string[]>;

export const DEFAULT_DIALOG: WorldDialog = {
  "shopkeep:shop": [
    "Everything's for sale. The economy demands it.",
    "No refunds. The fitting room is legally binding.",
    "You're my favorite customer. Statistically unavoidable.",
    "Shoplifting is impossible here. I checked the code.",
  ],
};

// ── Cosmetics overrides ───────────────────────────────────────────────
// style → partial override of the code catalog entry.
export type CosmeticsOverrides = Record<string, { name?: string; price?: number }>;

async function configValue<T>(key: string): Promise<T | null> {
  const row = await db.worldConfig.findUnique({ where: { key } });
  return (row?.value as T) ?? null;
}

export async function getDialog(): Promise<WorldDialog> {
  const overrides = (await configValue<WorldDialog>("dialog")) ?? {};
  // an override replaces that NPC's whole line list; empty arrays fall
  // back to defaults so a fat-fingered save can't mute an NPC entirely
  const merged = { ...DEFAULT_DIALOG };
  for (const [npc, lines] of Object.entries(overrides)) {
    if (Array.isArray(lines) && lines.length > 0) merged[npc] = lines;
  }
  return merged;
}

/** The shop catalog with admin price/name overrides applied. */
export async function getEffectiveCatalog(): Promise<ShopOutfit[]> {
  const overrides = (await configValue<CosmeticsOverrides>("cosmetics")) ?? {};
  return SHOP_OUTFITS.map((o) => {
    const ov = overrides[o.style];
    return {
      ...o,
      name: ov?.name?.trim() || o.name,
      price: typeof ov?.price === "number" && ov.price >= 0 ? Math.floor(ov.price) : o.price,
    };
  });
}

export async function getEffectiveOutfit(style: string): Promise<ShopOutfit | undefined> {
  return (await getEffectiveCatalog()).find((o) => o.style === style);
}

/** House sticker price — code default, admin override via key "houses". */
export async function getHousePrice(): Promise<number> {
  const cfg = await configValue<{ price?: number }>("houses");
  return typeof cfg?.price === "number" && cfg.price >= 0
    ? Math.floor(cfg.price)
    : DEFAULT_HOUSE_PRICE;
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  await db.worldConfig.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
