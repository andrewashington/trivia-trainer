import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { HOUSE_PLOTS } from "@/modules/world/houses";
import { getHousePlacedItems } from "@/modules/world/furnitureServer";

/**
 * GET /api/world/house/items?plot=N — the placed furniture in the house at
 * plot N, keyed off whoever owns the plot. The scene calls this on entry
 * so visitors see the owner's décor. Any signed-in user may look.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const plot = Number(new URL(req.url).searchParams.get("plot"));
  if (!(HOUSE_PLOTS as readonly number[]).includes(plot)) {
    return NextResponse.json({ items: [] });
  }
  const items = await getHousePlacedItems(plot);
  return NextResponse.json({ items });
});
