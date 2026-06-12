import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import {
  dealHand,
  isBlackjack,
  settle,
  type HandStatus,
} from "@/modules/blackjack/engine";
import { spendCoins, creditWinnings } from "@/modules/arcade/bank";
import { dealInput } from "@/modules/blackjack/schema";
import { tableView } from "@/modules/blackjack/server";

/**
 * Blackjack table state + deal endpoint. All money movement follows the
 * coins pattern used everywhere else: CoinTransaction ledger row +
 * User.coins increment in the SAME transaction as the hand mutation.
 * Reasons: "blackjack.bet" (negative), "blackjack.win" / "blackjack.push"
 * (credits back, stake included).
 */

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json(await tableView(user.id));
});

/** Deal a new hand: debits the bet, resolves naturals immediately. */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { bet } = await parseBody(req, dealInput);

  const handId = await db.$transaction(async (tx) => {
    const existing = await tx.blackjackHand.findFirst({
      where: { userId: user.id, status: "active" },
      select: { id: true },
    });
    if (existing) throw new HttpError(409, "You already have a hand in play.");

    // Stake leaves the balance the moment the cards come out.
    await spendCoins(
      tx,
      user.id,
      bet,
      "blackjack.bet",
      "Blackjack bet",
      "You can't bet more coins than you have."
    );

    const state = dealHand();
    const playerNatural = isBlackjack(state.player);
    const dealerNatural = isBlackjack(state.dealer);

    let status: HandStatus = "active";
    let payout = 0;
    if (playerNatural || dealerNatural) {
      if (playerNatural && dealerNatural) {
        status = "push";
        payout = bet;
      } else if (playerNatural) {
        ({ status, payout } = settle(state, bet, { natural: true }));
      } else {
        status = "lost";
      }
    }

    const hand = await tx.blackjackHand.create({
      data: {
        userId: user.id,
        bet,
        state: state as unknown as Prisma.InputJsonValue,
        status,
        payout,
        resolvedAt: status === "active" ? null : new Date(),
      },
      select: { id: true },
    });

    if (payout > 0) {
      await creditWinnings(
        tx,
        user.id,
        payout,
        status === "push" ? "blackjack.push" : "blackjack.win",
        status === "blackjack" ? "Blackjack!" : "Blackjack push"
      );
    }

    if (status === "blackjack") {
      await emitOutbox(tx, "arcade.blackjack.won", {
        game: "blackjack",
        userId: user.id,
        displayName: user.displayName,
        bet,
        net: payout - bet,
        natural: true,
      });
    }
    return hand.id;
  });

  return NextResponse.json(await tableView(user.id, handId));
});
