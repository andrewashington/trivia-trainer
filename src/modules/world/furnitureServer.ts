// server-side only (imports db) — keep out of client components
import { db } from "@/lib/db";
import {
  payloadFromItem,
  type InventoryItem,
  type ScenePlacedItem,
  type ShopEntry,
} from "./furniture";

/**
 * Furniture data access. The catalog is `WorldItem` (seeded from the
 * hand-tagged catalog-seed.json via scripts/world-seed-catalog.ts);
 * ownership + placement is `WorldOwnedItem`. Everything published & priced
 * with availability "shop" is buyable; placed rows (x/y set) render in the
 * owner's house for anyone who visits.
 */

/** The shop catalog, grouped by variant group, with the caller's owned counts. */
export async function getFurnitureCatalog(userId: string): Promise<ShopEntry[]> {
  const [items, ownedCounts] = await Promise.all([
    db.worldItem.findMany({
      where: { published: true, availability: "shop", price: { gt: 0 } },
      orderBy: [{ theme: "asc" }, { name: "asc" }],
    }),
    db.worldOwnedItem.groupBy({
      by: ["itemId"],
      where: { userId },
      _count: { itemId: true },
    }),
  ]);
  const ownedByItem = new Map(ownedCounts.map((r) => [r.itemId, r._count.itemId]));

  const groups = new Map<string, ShopEntry>();
  for (const it of items) {
    const groupKey = it.variantGroup ?? `item:${it.id}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        name: it.name,
        tagline: it.tagline,
        tier: it.tier,
        theme: it.theme,
        category: it.category,
        surface: it.surface,
        tileW: it.tileW,
        tileH: it.tileH,
        tags: it.tags,
        variants: [],
      };
      groups.set(groupKey, group);
    } else {
      // colorways can carry slightly different tags — union them so facet
      // filters match the whole group
      for (const t of it.tags) if (!group.tags.includes(t)) group.tags.push(t);
    }
    group.variants.push({
      itemId: it.id,
      itemKey: it.key,
      variant: it.variant,
      spriteKey: it.spriteKey,
      price: it.price,
      owned: ownedByItem.get(it.id) ?? 0,
    });
  }
  return [...groups.values()];
}

/** The caller's whole inventory (placed + stored) for the decorate tray. */
export async function getInventory(userId: string): Promise<InventoryItem[]> {
  const rows = await db.worldOwnedItem.findMany({
    where: { userId },
    include: { item: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    ...payloadFromItem(r.item, r.id),
    itemId: r.itemId,
    itemKey: r.item.key,
    placed: r.x !== null && r.y !== null,
    x: r.x,
    y: r.y,
    rotation: r.rotation,
  }));
}

/**
 * Every placed piece in the house at `plot` — keyed off whoever OWNS the
 * plot, so visitors see the owner's décor (not their own). Empty if the
 * plot is unowned.
 */
export async function getHousePlacedItems(plot: number): Promise<ScenePlacedItem[]> {
  const house = await db.worldHouse.findUnique({ where: { plot } });
  if (!house) return [];
  const rows = await db.worldOwnedItem.findMany({
    where: { userId: house.userId, x: { not: null }, y: { not: null } },
    include: { item: true },
  });
  return rows.map((r) => ({
    ...payloadFromItem(r.item, r.id),
    x: r.x as number,
    y: r.y as number,
    rotation: r.rotation,
  }));
}
