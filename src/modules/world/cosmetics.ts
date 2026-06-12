/**
 * Cosmetics catalog — the shop side of the character system.
 *
 * The character-parts pipeline stages ALL outfit sheets to S3 but the
 * creator manifest only exposes the 5 free starters. Everything else is
 * shop inventory, defined here: the catalog (names, prices) lives in
 * code, ownership lives in the WorldOwnedCosmetic table. Buying a style
 * unlocks ALL of its color variants, in the shop and in /world/create.
 *
 * Adding future cosmetic kinds (hairstyles, pets, …): add a `kind`,
 * a catalog list, and reuse the same purchase/equip endpoints — the
 * ownership row is (userId, kind, itemKey).
 */

// Every outfit style → its color variants, measured from the staged
// sheets (assets-src/runtime/world/character-parts/outfits). Colors are
// 1-indexed in the LimeZu pack.
export const OUTFIT_COLORS: Record<string, string[]> = {
  "01": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
  "02": ["01", "02", "03", "04"],
  "03": ["01", "02", "03", "04"],
  "04": ["01", "02", "03"],
  "05": ["01", "02", "03", "04", "05"],
  "06": ["01", "02", "03", "04"],
  "07": ["01", "02", "03", "04"],
  "08": ["01", "02", "03"],
  "09": ["01", "02", "03"],
  "10": ["01", "02", "03", "04", "05"],
  "11": ["01", "02", "03", "04"],
  "12": ["01", "02", "03"],
  "13": ["01", "02", "03", "04"],
  "14": ["01", "02", "03", "04", "05"],
  "15": ["01", "02", "03"],
  "16": ["01", "02", "03"],
  "17": ["01", "02", "03"],
  "18": ["01", "02", "03", "04"],
  "19": ["01", "02", "03", "04"],
  "20": ["01", "02", "03"],
  "21": ["01", "02", "03", "04"],
  "22": ["01", "02", "03", "04"],
  "23": ["01", "02", "03", "04"],
  "24": ["01", "02", "03", "04"],
  "25": ["01", "02", "03", "04", "05"],
  "26": ["01", "02", "03"],
  "27": ["01", "02", "03"],
  "28": ["01", "02", "03", "04"],
  "29": ["01", "02", "03", "04"],
  "30": ["01", "02", "03"],
  "31": ["01", "02", "03", "04", "05"],
  "32": ["01", "02", "03", "04", "05"],
  "33": ["01", "02", "03"],
};

// Free starter wardrobe (mirrors BASE_OUTFITS in world-character-parts.ts).
export const STARTER_OUTFITS = ["01", "04", "07", "12", "16"];

export type ShopOutfit = {
  style: string;
  name: string;
  price: number;
};

// Names eyeballed from a labeled contact sheet of the actual sprites.
// Price tiers: 150 everyday / 300 has-a-personality / 600 statement /
// 1200 you-have-a-problem.
export const SHOP_OUTFITS: ShopOutfit[] = [
  { style: "02", name: "Crimson Regalia", price: 600 },
  { style: "03", name: "Business Casualty", price: 150 },
  { style: "05", name: "The Interview", price: 300 },
  { style: "06", name: "Funeral Chic", price: 300 },
  { style: "08", name: "Lavender Menace", price: 150 },
  { style: "09", name: "Yes, Chef", price: 300 },
  { style: "10", name: "Dependable Slacks", price: 150 },
  { style: "11", name: "Garden Party Incident", price: 150 },
  { style: "13", name: "Denim, On Purpose", price: 150 },
  { style: "14", name: "Grandma's Wallpaper", price: 300 },
  { style: "15", name: "Athleisure Forever", price: 150 },
  { style: "17", name: "Quiet Ambition", price: 150 },
  { style: "18", name: "Yeehaw, Probably", price: 300 },
  { style: "19", name: "Mall Cop Authority", price: 600 },
  { style: "20", name: "Nautical Nonsense", price: 300 },
  { style: "21", name: "Twilight Influencer", price: 300 },
  { style: "22", name: "Apron of Commerce", price: 300 },
  { style: "23", name: "High-Vis Icon", price: 300 },
  { style: "24", name: "Vacation Dad", price: 300 },
  { style: "25", name: "Regatta Imposter", price: 600 },
  { style: "26", name: "Decorated Veteran (of Errands)", price: 600 },
  { style: "27", name: "Gray Area", price: 150 },
  { style: "28", name: "Varsity Legend", price: 600 },
  { style: "29", name: "Honest Laborer", price: 300 },
  { style: "30", name: "The Shadow Protocol", price: 1200 },
  { style: "31", name: "Pool Rules Violation", price: 600 },
  { style: "32", name: "Lifeguard Off Duty", price: 600 },
  { style: "33", name: "Heir Apparent", price: 1200 },
];

export function shopOutfit(style: string): ShopOutfit | undefined {
  return SHOP_OUTFITS.find((o) => o.style === style);
}

/**
 * The outfit styles a user may wear: starters + purchases. Returned as
 * a style→colors map shaped like the creator manifest's `outfits`.
 */
export function wearableOutfits(ownedStyles: string[]): Record<string, string[]> {
  const styles = [...STARTER_OUTFITS, ...ownedStyles];
  return Object.fromEntries(
    styles.filter((s) => OUTFIT_COLORS[s]).map((s) => [s, OUTFIT_COLORS[s]])
  );
}
