import { db } from "@/lib/db";
import { creditWinnings } from "@/modules/arcade/bank";
import { refreshBookMarket } from "./polymarket";

const CHECK_INTERVAL_MS = 5 * 60_000;
let lastCheck = 0;

export async function settleDueBookBets(force = false): Promise<number> {
  if (!force && Date.now() - lastCheck < CHECK_INTERVAL_MS) return 0;
  lastCheck = Date.now();

  const markets = await db.bookMarket.findMany({
    where: { bets: { some: { status: "open" } } },
    include: { bets: { where: { status: "open" } } },
    take: 25,
  });

  let settled = 0;
  for (const market of markets) {
    const fresh = await refreshBookMarket(market.id).catch(() => null);
    const latest = fresh ?? market;
    if (!latest.closed && latest.active) continue;

    const outcome = latest.resolvedOutcome === "Yes" || latest.resolvedOutcome === "No"
      ? latest.resolvedOutcome
      : null;

    for (const bet of market.bets) {
      const status = outcome === null ? "void" : bet.outcome === outcome ? "won" : "lost";
      await db.$transaction(async (tx) => {
        const updated = await tx.bookBet.updateMany({
          where: { id: bet.id, status: "open" },
          data: { status, settledAt: new Date() },
        });
        if (updated.count === 0) return;
        if (status === "won") {
          await creditWinnings(tx, bet.userId, bet.potentialPayout, "book.win", "The Book win", {
            marketId: market.id,
            question: market.question,
            outcome: bet.outcome,
          });
        } else if (status === "void") {
          await creditWinnings(tx, bet.userId, bet.stake, "book.void", "The Book refund", {
            marketId: market.id,
            question: market.question,
            outcome: bet.outcome,
          });
        }
        settled += 1;
      });
    }
  }
  return settled;
}
