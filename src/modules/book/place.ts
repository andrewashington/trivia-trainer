import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";
import { emitOutbox } from "@/lib/outbox";
import { spendCoins, validateBet } from "@/modules/arcade/bank";
import { potentialPayout, priceForOutcome, refreshBookMarket } from "@/modules/book/polymarket";

/**
 * Single source of truth for placing a Book bet, shared by the API route
 * (/api/book/bets) and the Discord one-tap buttons. Mirrors the same invariants
 * either way: refresh the line, validate it's open with clean odds, spend coins
 * + create the bet in one transaction, emit the feed event on the first bet, and
 * re-render the tracked Discord card (avatars + tally) on every bet after that.
 */

export type BookBetResult = {
  coins: number;
  betCount: number;
  yesCount: number;
  noCount: number;
  totalStake: number;
  price: number;
  payout: number;
  outcome: "Yes" | "No";
};

export async function placeBookBet(opts: {
  userId: string;
  marketId: string;
  outcome: "Yes" | "No";
  stake: number;
  /**
   * Pull fresh odds from Polymarket before booking (default). The Discord
   * one-tap path passes `false` so a slow upstream fetch can't blow the 3s
   * interaction-ack window — odds were fresh when the card posted and lock at
   * slip time regardless.
   */
  refresh?: boolean;
}): Promise<BookBetResult> {
  const stake = validateBet(opts.stake);

  const fresh =
    opts.refresh === false ? null : await refreshBookMarket(opts.marketId).catch(() => null);
  const market = fresh ?? (await db.bookMarket.findUnique({ where: { id: opts.marketId } }));
  if (!market) throw new HttpError(404, "That line fell off the board.");
  if (!market.active || market.closed || market.resolvedOutcome) {
    throw new HttpError(400, "That line is closed.");
  }
  if (market.endDate && market.endDate <= new Date()) {
    throw new HttpError(400, "That line already reached the bell.");
  }

  const price = priceForOutcome(market, opts.outcome);
  if (price === null) throw new HttpError(400, "That line does not have clean odds right now.");
  const payout = potentialPayout(stake, price);
  if (payout <= stake) throw new HttpError(400, "Those odds are too weird to book.");

  const result = await db.$transaction(async (tx) => {
    await spendCoins(
      tx,
      opts.userId,
      stake,
      "book.bet",
      "The Book slip",
      "Not enough coins for that slip.",
      {
        marketId: market.id,
        question: market.question,
        outcome: opts.outcome,
        price,
        potentialPayout: payout,
      }
    );
    await tx.bookBet.create({
      data: {
        userId: opts.userId,
        marketId: market.id,
        outcome: opts.outcome,
        stake,
        price,
        potentialPayout: payout,
      },
    });

    // Tally the whole market for the Discord card's live Yes/No split.
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

    // First side taken → post one card to the feed (the drainer renders it,
    // avatars and all). Later bets edit that card in place instead.
    if (betCount === 1) {
      await emitOutbox(tx, "book.bet.placed", {
        marketId: market.id,
        question: market.question,
        category: market.category,
        outcome: opts.outcome,
        userId: opts.userId,
        yesCount,
        noCount,
        totalStake,
      });
    }

    const me = await tx.user.findUniqueOrThrow({ where: { id: opts.userId }, select: { coins: true } });
    return { coins: me.coins, betCount, yesCount, noCount, totalStake };
  });

  // Subsequent bets: re-render the tracked card with the new avatar collage +
  // tally. Fire-and-forget — a Discord hiccup must never fail the bet.
  if (result.betCount > 1) {
    void (async () => {
      try {
        const { refreshBookCard } = await import("@/modules/book/discordCard");
        await refreshBookCard(market.id);
      } catch (err) {
        console.error("[book] card refresh failed", err);
      }
    })();
  }

  return { ...result, price, payout, outcome: opts.outcome };
}
