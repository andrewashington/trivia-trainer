import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { scoreInput } from "@/modules/snake/schema";

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, scoreInput);

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

  const isHighScore = data.score > 0 && data.score > (top?.score ?? 0);
  const isPersonalBest =
    data.score > 0 && data.score > (prevPersonalBest._max.score ?? 0);

  const created = await withOutbox(
    (tx) =>
      tx.arcadeScore.create({
        data: {
          userId: user.id,
          game: data.game,
          score: data.score,
          meta: data.meta ?? undefined,
        },
      }),
    () => ({
      // A run always feeds the pet; a new group record gets the louder
      // event so the Discord worker / feed can call it out.
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
