import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** The signed-in user's balance + a short recent-earnings ledger. */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const recent = await db.coinTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { amount: true, reason: true, meta: true, createdAt: true },
  });
  return NextResponse.json({ coins: user.coins, recent });
});
