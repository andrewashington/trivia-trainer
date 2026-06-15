import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
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
    const me = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } });
    return { bet, coins: me.coins };
  });

  return NextResponse.json(result, { status: 201 });
});
