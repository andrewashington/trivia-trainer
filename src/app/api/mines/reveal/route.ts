import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  minesMultiplier,
  payout,
  creditWinnings,
  logRound,
} from "@/modules/arcade/bank";
import { revealInput } from "@/modules/mines/schema";
import { toMinesView } from "@/modules/mines/server";

/** POST: reveal a tile. Handles bust, safe reveal, and auto-cashout. */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { tile } = await parseBody(req, revealInput);

  let gameId: string | null = null;

  await db.$transaction(async (tx) => {
    const game = await tx.minesGame.findFirst({
      where: { userId: user.id, status: "active" },
    });
    if (!game) throw new HttpError(404, "No active Mines round found.");

    if (game.revealed.includes(tile)) {
      throw new HttpError(400, "Tile already revealed.");
    }

    const isMine = game.mines.includes(tile);

    if (isMine) {
      // Bust: lose the stake
      await tx.minesGame.update({
        where: { id: game.id },
        data: { status: "busted", settledAt: new Date() },
      });
      await logRound(tx, {
        userId: user.id,
        game: "mines",
        stake: game.stake,
        multiplier: 0,
        outcome: "loss",
        net: -game.stake,
      });
    } else {
      // Safe reveal
      const newRevealed = [...game.revealed, tile];
      const newMult = minesMultiplier(game.mineCount, newRevealed.length);
      const safeTilesTotal = 25 - game.mineCount;
      const allSafeFound = newRevealed.length === safeTilesTotal;

      if (allSafeFound) {
        // Auto cash-out: player revealed every safe tile
        const winnings = payout(game.stake, newMult);
        await tx.minesGame.update({
          where: { id: game.id },
          data: {
            revealed: newRevealed,
            multiplier: newMult,
            status: "cashed",
            settledAt: new Date(),
          },
        });
        await creditWinnings(
          tx,
          user.id,
          winnings,
          "mines.win",
          `Mines ${newMult.toFixed(2)}× auto-cashout`
        );
        await logRound(tx, {
          userId: user.id,
          game: "mines",
          stake: game.stake,
          multiplier: newMult,
          outcome: "win",
          net: winnings - game.stake,
        });
      } else {
        // Keep going
        await tx.minesGame.update({
          where: { id: game.id },
          data: {
            revealed: newRevealed,
            multiplier: newMult,
          },
        });
      }
    }

    gameId = game.id;
  });

  const game = await db.minesGame.findUniqueOrThrow({ where: { id: gameId! } });
  const user2 = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { coins: true },
  });
  return NextResponse.json({ game: toMinesView(game, user2.coins) });
});
