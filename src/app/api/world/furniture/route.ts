import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getFurnitureCatalog, getInventory } from "@/modules/world/furnitureServer";

/**
 * GET /api/world/furniture — everything the decorate tray needs in one
 * fetch: coin balance, the shop catalog (grouped by variant), and the
 * caller's full inventory (placed + stored). Buying and placing both flow
 * from here.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const [catalog, inventory] = await Promise.all([
    getFurnitureCatalog(user.id),
    getInventory(user.id),
  ]);
  return NextResponse.json({ coins: user.coins, catalog, inventory });
});
