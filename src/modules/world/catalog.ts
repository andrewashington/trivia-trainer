/**
 * World furniture catalog — shared vocabulary for the seed pipeline AND
 * the runtime shop/admin. Everything here is the SINGLE SOURCE OF TRUTH so
 * the economy is tunable in one place without re-touching items:
 *
 *   scan  (scripts/world-scan-furniture.ts)  → draft manifest
 *   tag   (World Studio "Furniture catalog")  → catalog-seed.json
 *   seed  (scripts/world-seed-catalog.ts)     → WorldItem rows + atlases
 *   shop/admin                                → read tiers/prices through here
 *
 * Design note (future-proofing): items carry a price TIER, not just a raw
 * coin amount. Price derives from the tier→amount map below, so the whole
 * economy rebalances by editing this map — no second pass over hundreds of
 * hand-tagged sprites. A raw `price` override stays available for one-off
 * statement pieces (the golden toilet).
 */

export type TierKey = "trinket" | "decor" | "furniture" | "statement" | "absurd";

export type TierDef = {
  key: TierKey;
  label: string; // shown on the tier chip in the tagging tool
  price: number; // default coin price for the tier
  blurb: string; // economy anchor, for the tooltip
};

/**
 * Anchors from docs/world-design.md "Economy notes": small decor 50-200,
 * furniture 300-1.5k, statement 3-5k, absurd flex pieces way above. Tune
 * here; every item priced by tier moves with it.
 */
export const TIERS: TierDef[] = [
  { key: "trinket", label: "Trinket", price: 30, blurb: "Clutter & tiny decor — mugs, books, plants" },
  { key: "decor", label: "Decor", price: 120, blurb: "Lamps, rugs, wall art, small shelves" },
  { key: "furniture", label: "Furniture", price: 600, blurb: "Real furniture — sofas, beds, tables" },
  { key: "statement", label: "Statement", price: 3500, blurb: "Centerpieces you buy to be seen owning" },
  { key: "absurd", label: "Absurd", price: 15000, blurb: "Visibly insane flex prices — the point" },
];

export const TIER_KEYS = TIERS.map((t) => t.key);
const TIER_BY_KEY = new Map(TIERS.map((t) => [t.key, t]));

export type Surface = "floor" | "wall" | "tabletop" | "ceiling";
export const SURFACES: Surface[] = ["floor", "wall", "tabletop", "ceiling"];

/**
 * Availability is orthogonal to price tier. "unobtainable" items exist in
 * the catalog and can be granted / owned / placed in a house, but never
 * appear in the shop — the rung above "absurd": too coveted to even buy.
 * Shop listing requires availability === "shop" AND a positive price.
 */
export type Availability = "shop" | "unobtainable";
export const UNOBTAINABLE: Availability = "unobtainable";

/**
 * Resolve an item's effective price: an explicit override wins, else the
 * tier default, else 0 (unpriced draft — never appears in the shop).
 */
export function priceFor(tier?: string | null, override?: number | null): number {
  if (typeof override === "number" && override >= 0) return Math.floor(override);
  const t = tier ? TIER_BY_KEY.get(tier as TierKey) : undefined;
  return t ? t.price : 0;
}

// ── pack-path parsing (stable keys; never positional) ───────────────────

/** "2_Living_Room_Singles" / "23_..._SIngles" → "living-room". */
export function themeSlug(folder: string): string {
  return folder
    .replace(/^\d+_/, "")
    .replace(/_?singles$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Human label for a theme folder: "Television and Film Studio". */
export function themeLabel(folder: string): string {
  return folder
    .replace(/^\d+_/, "")
    .replace(/_?singles$/i, "")
    .replace(/_+/g, " ")
    .trim()
    .replace(/\bSIngles\b/i, "")
    .trim();
}

/**
 * Stable item key from a singles filename + its theme. The trailing number
 * in the filename is the pack's own id, so the key survives re-scans and
 * pack updates: "mi-<theme>-<n>".
 */
export function itemKey(themeFolder: string, file: string): string {
  const n = file.match(/(\d+)\.png$/i)?.[1] ?? file.replace(/\.png$/i, "");
  return `mi-${themeSlug(themeFolder)}-${n}`;
}

/** Atlas key for a theme's packed sheet (one atlas page family per theme). */
export const atlasKey = (theme: string) => `furniture-${theme}`;

/**
 * spriteKey = "<atlasKey>#<frameName>" where frameName === the stable item
 * key. This is the crucial future-proofing: re-packing the atlas (adding
 * items, a pack update) never shifts frame names, so already-placed
 * WorldOwnedItem rows and cached textures keep resolving.
 */
export const spriteKeyFor = (theme: string, key: string) => `${atlasKey(theme)}#${key}`;
