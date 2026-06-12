import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getHousePrice } from "@/modules/world/content";
import { HOUSE_PLOTS } from "@/modules/world/houses";

/**
 * GET /api/world/house — the neighborhood's plot registry: who owns
 * which door, the current sticker price, and the caller's balance.
 * WorldClient consults this when the player steps onto a plot door.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const [houses, price, me] = await Promise.all([
    db.worldHouse.findMany({
      include: { user: { select: { id: true, displayName: true } } },
    }),
    getHousePrice(),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } }),
  ]);

  const byPlot = new Map(houses.map((h) => [h.plot, h]));
  return NextResponse.json({
    price,
    coins: me.coins,
    myPlot: houses.find((h) => h.userId === user.id)?.plot ?? null,
    plots: HOUSE_PLOTS.map((plot) => {
      const h = byPlot.get(plot);
      return {
        plot,
        owner: h ? { id: h.user.id, name: h.user.displayName || "someone" } : null,
      };
    }),
  });
});
