import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { scoreInput } from "@/modules/snake/schema";

// Reject if the submitted score is more than this multiple above the user's
// personal best. Guards against crafted API calls that pass session validation
// but still report an implausible score jump.
const SPIKE_MULTIPLIER = 3;

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, scoreInput);

  // Validate the game session token.
  const session = await db.gameSession.findUnique({ where: { id: data.sessionId } });
  if (!session || session.userId !== user.id || session.game !== data.game) {
    throw new HttpError(400, "Invalid session.");
  }
  if (session.usedAt) throw new HttpError(409, "Session already used.");
  if (session.expiresAt < new Date()) throw new HttpError(410, "Session expired.");

  // The group high score before this run — used to flag a record.
  const top = await db.arcadeScore.findFirst({
    where: { game: data.game },
    orderBy: { score: "desc" },
    select: { score: true },
  });
  const prevPersonalBest = await db.arcadeScore.aggregate({
    where: { game: data.game, userId: user.id },
    _max: { score: true },
  });

  const prevBest = prevPersonalBest._max.score;
  if (prevBest !== null && data.score > prevBest * SPIKE_MULTIPLIER) {
    throw new HttpError(400, "Score rejected.");
  }

  const isHighScore = data.score > 0 && data.score > (top?.score ?? 0);
  const isPersonalBest = data.score > 0 && data.score > (prevBest ?? 0);

  const created = await withOutbox(
    async (tx) => {
      await tx.gameSession.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });
      return tx.arcadeScore.create({
        data: {
          userId: user.id,
          game: data.game,
          score: data.score,
          meta: data.meta ?? undefined,
        },
      });
    },
    () => ({
      type: isHighScore ? "arcade.highscore" : "arcade.played",
      payload: {
        game: data.game,
        score: data.score,
        userId: user.id,
        displayName: user.displayName,
      },
    })
  );

  return NextResponse.json(
    { score: created, isHighScore, isPersonalBest },
    { status: 201 }
  );
});
