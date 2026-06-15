import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { settleDueBookBets } from "@/modules/book/settle";

export const POST = apiHandler(async () => {
  await requireAdmin();
  const count = await settleDueBookBets(true);
  return NextResponse.json({ ok: true, count });
});
