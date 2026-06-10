import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import {
  draw,
  handValue,
  playDealer,
  settle,
  type HandState,
  type HandStatus,
} from "@/modules/blackjack/engine";
import { actionInput } from "@/modules/blackjack/schema";
import { tableView } from "@/modules/blackjack/server";

/** A win this big (net, in coins) is feed-worthy. */
const BIG_WIN_NET = 50;

/**
 * Play the active hand: hit / stand / double. Everything resolves
 * server-side against the stored shoe; payouts land in the same
 * transaction (ledger row + User.coins), matching the coins pattern.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { handId, action } = await parseBody(req, actionInput);

  await db.$transaction(async (tx) => {
    const hand = await tx.blackjackHand.findUnique({ where: { id: handId } });
    if (!hand || hand.userId !== user.id) throw new HttpError(404, "Hand not found.");
    if (hand.status !== "active") throw new HttpError(409, "That hand is already settled.");

    const state = hand.state as unknown as HandState;
    let bet = hand.bet;
    let doubled = hand.doubled;
    let status: HandStatus = "active";
    let payout = 0;

    if (action === "double") {
      if (state.player.length !== 2)
        throw new HttpError(400, "Double down is only allowed on your first two cards.");
      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { coins: true },
      });
      if (me.coins < hand.bet)
        throw new HttpError(400, "Not enough coins to double down.");
      await tx.coinTransaction.create({
        data: {
          userId: user.id,
          amount: -hand.bet,
          reason: "blackjack.bet",
          meta: { label: "Blackjack double down" },
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { coins: { decrement: hand.bet } },
      });
      bet = hand.bet * 2;
      doubled = true;
      draw(state, "player");
      if (handValue(state.player).total <= 21) playDealer(state);
      ({ status, payout } = settle(state, bet));
    } else if (action === "hit") {
      draw(state, "player");
      const total = handValue(state.player).total;
      if (total > 21) {
        ({ status, payout } = settle(state, bet)); // bust → lost
      } else if (total === 21) {
        // nothing left to decide — play it out
        playDealer(state);
        ({ status, payout } = settle(state, bet));
      }
    } else {
      // stand
      playDealer(state);
      ({ status, payout } = settle(state, bet));
    }

    await tx.blackjackHand.update({
      where: { id: hand.id },
      data: {
        bet,
        doubled,
        state: state as unknown as Prisma.InputJsonValue,
        status,
        payout,
        resolvedAt: status === "active" ? null : new Date(),
      },
    });

    if (payout > 0) {
      await tx.coinTransaction.create({
        data: {
          userId: user.id,
          amount: payout,
          reason: status === "push" ? "blackjack.push" : "blackjack.win",
          meta: { label: status === "push" ? "Blackjack push" : "Blackjack win" },
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { coins: { increment: payout } },
      });
    }

    const net = payout - bet;
    if (status === "won" && net >= BIG_WIN_NET) {
      await emitOutbox(tx, "arcade.blackjack.won", {
        game: "blackjack",
        userId: user.id,
        displayName: user.displayName,
        bet,
        net,
        natural: false,
      });
    }
  });

  return NextResponse.json(await tableView(user.id));
});
