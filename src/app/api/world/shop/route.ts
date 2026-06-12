import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { AvatarConfig } from "@/modules/world/avatar";
import { SHOP_OUTFITS, STARTER_OUTFITS, OUTFIT_COLORS } from "@/modules/world/cosmetics";

/**
 * GET /api/world/shop — everything the shop modal needs in one fetch:
 * coin balance, the outfit catalog with ownership flags, the caller's
 * current avatar config (for try-on previews), and what's equipped.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const [owned, avatar] = await Promise.all([
    db.worldOwnedCosmetic.findMany({
      where: { userId: user.id, kind: "outfit" },
      select: { itemKey: true },
    }),
    db.worldAvatar.findUnique({ where: { userId: user.id } }),
  ]);
  const ownedSet = new Set(owned.map((o) => o.itemKey));
  const config = (avatar?.config as AvatarConfig | undefined) ?? null;

  return NextResponse.json({
    coins: user.coins,
    config,
    equipped: config?.outfit ?? null,
    starters: STARTER_OUTFITS,
    catalog: SHOP_OUTFITS.map((o) => ({
      ...o,
      colors: OUTFIT_COLORS[o.style],
      owned: ownedSet.has(o.style),
    })),
  });
});
