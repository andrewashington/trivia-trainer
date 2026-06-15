import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { emitOutbox } from "@/lib/outbox";
import { spendCoins, validateBet } from "@/modules/arcade/bank";
import { bookBetInput } from "@/modules/book/schema";
import { potentialPayout, priceForOutcome, refreshBookMarket } from "@/modules/book/polymarket";

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, bookBetInput);
  const stake = validateBet(input.stake);

  const fresh = await refreshBookMarket(input.marketId).catch(() => null);
  const market = fresh ?? (await db.bookMarket.findUnique({ where: { id: input.marketId } }));
  if (!market) throw new HttpError(404, "That line fell off the board.");
  if (!market.active || market.closed || market.resolvedOutcome) {
    throw new HttpError(400, "That line is closed.");
  }
  if (market.endDate && market.endDate <= new Date()) {
    throw new HttpError(400, "That line already reached the bell.");
  }

  const price = priceForOutcome(market, input.outcome);
  if (price === null) throw new HttpError(400, "That line does not have clean odds right now.");
  const payout = potentialPayout(stake, price);
  if (payout <= stake) throw new HttpError(400, "Those odds are too weird to book.");

  const result = await db.$transaction(async (tx) => {
    await spendCoins(
      tx,
      user.id,
      stake,
      "book.bet",
      "The Book slip",
      "Not enough coins for that slip.",
      {
        marketId: market.id,
        question: market.question,
        outcome: input.outcome,
        price,
        potentialPayout: payout,
      }
    );
    const bet = await tx.bookBet.create({
      data: {
        userId: user.id,
        marketId: market.id,
        outcome: input.outcome,
        stake,
        price,
        potentialPayout: payout,
      },
    });

    // Tally the whole market so the Discord card can show the live Yes/No split.
    const grouped = await tx.bookBet.groupBy({
      by: ["outcome"],
      where: { marketId: market.id },
      _count: { _all: true },
      _sum: { stake: true },
    });
    const yesCount = grouped.find((g) => g.outcome === "Yes")?._count._all ?? 0;
    const noCount = grouped.find((g) => g.outcome === "No")?._count._all ?? 0;
    const totalStake = grouped.reduce((sum, g) => sum + (g._sum.stake ?? 0), 0);
    const betCount = yesCount + noCount;

    // First side taken on this line → post one card to the feed. Later bets edit
    // that same card in place (below) rather than spamming a new post each time.
    if (betCount === 1) {
      await emitOutbox(tx, "book.bet.placed", {
        marketId: market.id,
        question: market.question,
        category: market.category,
        outcome: input.outcome,
        userId: user.id,
        yesCount,
        noCount,
        totalStake,
      });
    }

    const me = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } });
    return { bet, coins: me.coins, betCount, yesCount, noCount, totalStake };
  });

  // Subsequent bets: rewrite the tracked market card's tally line in place.
  // Fire-and-forget — a Discord hiccup must never fail the bet itself.
  if (result.betCount > 1) {
    void (async () => {
      try {
        const [{ editTrackedMessage }, { bookStatus }] = await Promise.all([
          import("@/lib/discord/messageState"),
          import("@/lib/discord/cardStatus"),
        ]);
        await editTrackedMessage("book", market.id, {
          status: bookStatus(result.yesCount, result.noCount, result.totalStake),
        });
      } catch (err) {
        console.error("[book] failed to update market card", err);
      }
    })();
  }

  return NextResponse.json(result, { status: 201 });
});
