import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { syncBookMarkets } from "@/modules/book/polymarket";
import { loadDiverseMarkets } from "@/modules/book/board";
import { settleDueBookBets } from "@/modules/book/settle";

export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const sort = url.searchParams.get("sort") ?? "hot";

  await settleDueBookBets().catch(() => 0);

  const newest = await db.bookMarket.findFirst({
    where: { active: true, closed: false },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });
  let [marketCount, richCount] = await Promise.all([
    db.bookMarket.count({ where: { active: true, closed: false } }),
    db.bookMarket.count({
      where: {
        active: true,
        closed: false,
        category: { not: null },
        volume24hr: { not: null },
        liquidity: { not: null },
      },
    }),
  ]);
  const stale = !newest || Date.now() - newest.lastSyncedAt.getTime() > 30 * 60_000;
  if (marketCount < 300 || richCount < 180 || stale) {
    await syncBookMarkets().catch(() => 0);
    [marketCount, richCount] = await Promise.all([
      db.bookMarket.count({ where: { active: true, closed: false } }),
      db.bookMarket.count({
        where: {
          active: true,
          closed: false,
          category: { not: null },
          volume24hr: { not: null },
          liquidity: { not: null },
        },
      }),
    ]);
  }

  // A search or a specific category wants depth on that slice; the default
  // ("All", no query) wants breadth — a category-balanced spread of the board.
  const filtered = !!q || (!!category && category !== "All");
  const [markets, bets, me] = await Promise.all([
    filtered
      ? db.bookMarket.findMany({
          where: {
            active: true,
            closed: false,
            ...(q ? { question: { contains: q, mode: "insensitive" as const } } : {}),
            ...(category && category !== "All" ? { category } : {}),
          },
          orderBy:
            sort === "soon"
              ? [{ endDate: "asc" }, { volume24hr: "desc" }]
              : sort === "liquid"
                ? [{ liquidity: "desc" }, { volume24hr: "desc" }]
                : [{ volume24hr: "desc" }, { volume: "desc" }, { liquidity: "desc" }],
          take: 240,
        })
      : loadDiverseMarkets(600),
    db.bookBet.findMany({
      where: { userId: user.id },
      include: { market: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } }),
  ]);

  const categories = await db.bookMarket.groupBy({
    by: ["category"],
    where: { active: true, closed: false, category: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { category: "desc" } },
    take: 14,
  });

  return NextResponse.json({
    markets,
    bets,
    coins: me.coins,
    categories: categories.map((c) => ({ name: c.category!, count: c._count._all })),
  });
});
