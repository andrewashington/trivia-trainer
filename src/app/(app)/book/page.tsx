import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { BookBoard } from "@/modules/book/BookBoard";
import { settleDueBookBets } from "@/modules/book/settle";
import { syncBookMarkets } from "@/modules/book/polymarket";

export const metadata = { title: "The Book" };
export const dynamic = "force-dynamic";

export default async function BookPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  await settleDueBookBets().catch(() => 0);
  const [activeCount, richCount, newest] = await Promise.all([
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
    db.bookMarket.findFirst({
      where: { active: true, closed: false },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    }),
  ]);
  const stale = !newest || Date.now() - newest.lastSyncedAt.getTime() > 30 * 60_000;
  if (activeCount < 300 || richCount < 180 || stale) await syncBookMarkets().catch(() => 0);

  const [markets, bets, me] = await Promise.all([
    db.bookMarket.findMany({
      where: { active: true, closed: false },
      orderBy: [{ volume24hr: "desc" }, { volume: "desc" }, { liquidity: "desc" }],
      take: 240,
    }),
    db.bookBet.findMany({
      where: { userId: user.id },
      include: { market: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="The Book"
        icon="notebook"
        accentBg="bg-accent-book text-white"
      />
      <BookBoard
        initialCoins={me.coins}
        initialMarkets={markets.map((m) => ({
          id: m.id,
          question: m.question,
          category: m.category,
          eventTitle: m.eventTitle,
          description: m.description,
          image: m.image,
          outcomePrices: m.outcomePrices,
          tags: m.tags,
          volume: m.volume,
          volume24hr: m.volume24hr,
          liquidity: m.liquidity,
          spread: m.spread,
          endDate: m.endDate?.toISOString() ?? null,
        }))}
        initialBets={bets.map((b) => ({
          id: b.id,
          outcome: b.outcome,
          stake: b.stake,
          price: b.price,
          potentialPayout: b.potentialPayout,
          status: b.status,
          createdAt: b.createdAt.toISOString(),
          settledAt: b.settledAt?.toISOString() ?? null,
          market: {
            question: b.market.question,
            resolvedOutcome: b.market.resolvedOutcome,
          },
        }))}
      />
    </div>
  );
}
