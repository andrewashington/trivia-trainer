/**
 * Furniture — the buy-and-place side of the World economy.
 *
 * This file is the CLIENT-SAFE half: pure helpers + types shared by the
 * Phaser scene, the React decorate tray, the typed bridge, and the API
 * routes. It must NOT import `db` (server-only queries live in
 * furnitureServer.ts) so it can be bundled into the game client.
 *
 * Catalog rows are `WorldItem`; ownership + placement is `WorldOwnedItem`
 * (x/y/rotation on the row — a null position means "in storage"). One
 * user owns one house, so a placed item is implicitly in that house.
 */

import type { WorldItem } from "@prisma/client";

// ── Solidity (the "solid for big floor items only" rule) ────────────────
// Derived from the catalog — no DB column. Big floor furniture blocks the
// player; rugs, trinkets, wall art and tabletop bits stay walk-through so
// nobody boxes themselves into a 14×14 room.

const FLAT_TAG = /\b(rug|mat|carpet|runner|tatami)\b/i;

/** A flat floor decal (rug/mat) — passable, and renders UNDER furniture. */
export function isFlat(surface: string, tags: string[]): boolean {
  if (surface !== "floor") return false;
  return tags.some((t) => FLAT_TAG.test(t));
}

/**
 * Does this piece block movement? Only floor furniture with a footprint of
 * ≥2 tiles that isn't a flat decal. Wall/tabletop/ceiling never collide.
 */
export function isSolidFurniture(
  surface: string,
  tileW: number,
  tileH: number,
  tags: string[]
): boolean {
  if (surface !== "floor") return false;
  if (isFlat(surface, tags)) return false;
  return tileW * tileH >= 2;
}

// ── spriteKey parsing ───────────────────────────────────────────────────
// spriteKey = "<atlasKey>#<frameName>", e.g. "furniture-living-room#mi-living-room-12".
// The atlas lives at world/atlas/<atlasKey>.png + .json; the frame name is
// the stable item key, so re-packs never shift it.

export function parseSpriteKey(
  spriteKey: string
): { atlasKey: string; frame: string } | null {
  const hash = spriteKey.indexOf("#");
  if (hash <= 0 || hash >= spriteKey.length - 1) return null;
  return { atlasKey: spriteKey.slice(0, hash), frame: spriteKey.slice(hash + 1) };
}

// ── Shared payload + view types ─────────────────────────────────────────

/** Everything the scene needs to render & reason about one furniture piece. */
export type FurniturePlacePayload = {
  ownedId: string;
  name: string;
  spriteKey: string;
  price: number;
  surface: string;
  tileW: number;
  tileH: number;
  solid: boolean;
  flat: boolean;
};

/** A placed piece (scene render / visitor view): payload + world position. */
export type ScenePlacedItem = FurniturePlacePayload & {
  x: number;
  y: number;
  rotation: number; // 0 = as-drawn, 1 = mirrored (flipX). 2D sprites flip, not spin.
};

/** One owned row in the decorate tray's "My stuff" tab. */
export type InventoryItem = FurniturePlacePayload & {
  itemId: string;
  itemKey: string;
  placed: boolean;
  x: number | null;
  y: number | null;
  rotation: number;
};

/** One purchasable variant within a shop group (a colorway / material). */
export type ShopVariant = {
  itemId: string;
  itemKey: string;
  variant: string | null;
  spriteKey: string;
  price: number;
  owned: number; // how many of this exact variant the caller owns
};

/** A shop listing: one entry per variant group (colorways collapse to one). */
export type ShopEntry = {
  groupKey: string;
  name: string;
  tagline: string | null;
  tier: string | null;
  theme: string | null;
  category: string;
  surface: string;
  tileW: number;
  tileH: number;
  tags: string[];
  variants: ShopVariant[];
};

/** Build the render/payload fields from a catalog row (server + tests). */
export function payloadFromItem(
  item: Pick<
    WorldItem,
    "name" | "spriteKey" | "price" | "surface" | "tileW" | "tileH" | "tags"
  >,
  ownedId: string
): FurniturePlacePayload {
  return {
    ownedId,
    name: item.name,
    spriteKey: item.spriteKey,
    price: item.price,
    surface: item.surface,
    tileW: item.tileW,
    tileH: item.tileH,
    solid: isSolidFurniture(item.surface, item.tileW, item.tileH, item.tags),
    flat: isFlat(item.surface, item.tags),
  };
}
