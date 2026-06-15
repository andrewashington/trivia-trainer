import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { syncBookMarkets } from "@/modules/book/polymarket";

export const POST = apiHandler(async () => {
  await requireAdmin();
  const count = await syncBookMarkets();
  return NextResponse.json({ ok: true, count });
});
