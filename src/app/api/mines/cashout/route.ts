import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  payout,
  creditWinnings,
  logRound,
} from "@/modules/arcade/bank";
import { toMinesView } from "@/modules/mines/server";

/** POST: cash out the current active round. With 0 reveals this refunds the stake. */
export const POST = apiHandler(async () => {
  const user = await requireUser();

  let gameId: string | null = null;

  await db.$transaction(async (tx) => {
    const game = await tx.minesGame.findFirst({
      where: { userId: user.id, status: "active" },
    });
    if (!game) throw new HttpError(404, "No active Mines round found.");

    // Guard against double cash-out with an atomic conditional update
    const upd = await tx.minesGame.updateMany({
      where: { id: game.id, status: "active" },
      data: { status: "cashed", settledAt: new Date() },
    });
    if (upd.count === 0) throw new HttpError(409, "Round already settled.");

    const winnings = payout(game.stake, game.multiplier);
    await creditWinnings(
      tx,
      user.id,
      winnings,
      "mines.win",
      `Mines ${game.multiplier.toFixed(2)}× cashout`
    );
    await logRound(tx, {
      userId: user.id,
      game: "mines",
      stake: game.stake,
      multiplier: game.multiplier,
      outcome: "win",
      net: winnings - game.stake,
    });

    gameId = game.id;
  });

  const game = await db.minesGame.findUniqueOrThrow({ where: { id: gameId! } });
  const user2 = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { coins: true },
  });
  return NextResponse.json({ game: toMinesView(game, user2.coins) });
});
