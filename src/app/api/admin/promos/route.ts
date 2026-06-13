import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { setConfig } from "@/lib/appConfig";
import { allPromos } from "@/lib/coinRewards";
import { requireAdmin } from "@/lib/session";
import { promosPut } from "@/modules/admin/schema";

/** GET /api/admin/promos — the full campaign set (override or code defaults). */
export const GET = apiHandler(async () => {
  await requireAdmin();
  return NextResponse.json({ rewards: await allPromos() });
});

/** PUT /api/admin/promos — replace the active campaign set. */
export const PUT = apiHandler(async (req: Request) => {
  await requireAdmin();
  const { rewards } = await parseBody(req, promosPut);
  await setConfig("coin.rewards", rewards);
  return NextResponse.json({ ok: true });
});
