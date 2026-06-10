import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { firstPlayer } from "@/modules/tanks/engine";
import { gameInclude, gamePayload } from "@/modules/tanks/server";

const createInput = z.object({ opponentId: z.string().min(1) });

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { opponentId } = await parseBody(req, createInput);
  if (opponentId === user.id) throw new HttpError(400, "You can't duel yourself.");

  const opponent = await db.user.findUnique({ where: { id: opponentId } });
  if (!opponent) throw new HttpError(404, "Opponent not found.");

  // 31-bit seed: drives terrain, wind, and who fires first.
  const seed = Math.floor(Math.random() * 0x7fffffff);

  const game = await withOutbox(
    (tx) =>
      tx.tanksGame.create({
        data: {
          seed,
          challengerId: user.id,
          opponentId,
          currentPlayerId: firstPlayer(seed) === 0 ? user.id : opponentId,
        },
        include: gameInclude,
      }),
    (g) => ({
      type: "arcade.tanks.challenged",
      payload: {
        gameId: g.id,
        challengerId: user.id,
        challenger: user.displayName,
        opponentId,
        opponent: opponent.displayName,
      },
    })
  );

  return NextResponse.json({ game: gamePayload(game) }, { status: 201 });
});
