import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { syncBookMarkets } from "@/modules/book/polymarket";
import { settleDueBookBets } from "@/modules/book/settle";

export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  await settleDueBookBets().catch(() => 0);

  let marketCount = await db.bookMarket.count({ where: { active: true, closed: false } });
  if (marketCount === 0) {
    await syncBookMarkets().catch(() => 0);
    marketCount = await db.bookMarket.count({ where: { active: true, closed: false } });
  }

  const [markets, bets, me] = await Promise.all([
    db.bookMarket.findMany({
      where: {
        active: true,
        closed: false,
        ...(q ? { question: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ endDate: "asc" }, { lastSyncedAt: "desc" }],
      take: 40,
    }),
    db.bookBet.findMany({
      where: { userId: user.id },
      include: { market: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } }),
  ]);

  return NextResponse.json({ markets, bets, coins: me.coins });
});
