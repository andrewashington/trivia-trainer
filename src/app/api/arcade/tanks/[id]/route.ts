import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { gameInclude, gamePayload, loadGame } from "@/modules/tanks/server";

type Ctx = { params: { id: string } };

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser(); // any member may watch a duel
  const game = await loadGame(params.id);
  return NextResponse.json({ game: gamePayload(game) });
});

// Resign: the other player takes the win.
export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const game = await loadGame(params.id);
  if (game.challengerId !== user.id && game.opponentId !== user.id)
    throw new HttpError(403, "Not your duel.");
  if (game.status !== "active") throw new HttpError(400, "This duel is already over.");

  const winnerId = game.challengerId === user.id ? game.opponentId : game.challengerId;
  const winner = winnerId === game.challengerId ? game.challenger : game.opponent;

  const updated = await withOutbox(
    (tx) =>
      tx.tanksGame.update({
        where: { id: game.id },
        data: { status: "finished", winnerId, finishedAt: new Date() },
        include: gameInclude,
      }),
    () => ({
      type: "arcade.tanks.finished",
      payload: {
        gameId: game.id,
        winnerId,
        winner: winner.displayName,
        loserId: user.id,
        loser: user.displayName,
        resigned: true,
      },
    })
  );

  return NextResponse.json({ game: gamePayload(updated) });
});
