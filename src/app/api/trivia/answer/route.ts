import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { answerInput, type AnswerResult } from "@/modules/trivia/schema";
import { getRound, gradeAnswer } from "@/modules/trivia/store";

/**
 * Grade one answer against the server-held round. When the last
 * question lands, the score is persisted to ArcadeScore (game:
 * "trivia") and the arcade outbox event fires — same shape as Snake.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, answerInput);

  const round = getRound(data.roundId, user.id);
  const graded = gradeAnswer(round, data.questionIndex, data.answer);

  const result: AnswerResult = {
    correct: graded.correct,
    correctAnswer: graded.correctAnswer,
    done: graded.done,
  };

  if (graded.done && !round.finalized) {
    round.finalized = true;
    const score = graded.score;

    const top = await db.arcadeScore.findFirst({
      where: { game: "trivia" },
      orderBy: { score: "desc" },
      select: { score: true },
    });
    const prevPersonalBest = await db.arcadeScore.aggregate({
      where: { game: "trivia", userId: user.id },
      _max: { score: true },
    });

    const isHighScore = score > 0 && score > (top?.score ?? 0);
    const isPersonalBest =
      score > 0 && score > (prevPersonalBest._max.score ?? 0);

    await withOutbox(
      (tx) =>
        tx.arcadeScore.create({
          data: {
            userId: user.id,
            game: "trivia",
            score,
            meta: { perfect: score === round.questions.length },
          },
        }),
      () => ({
        type: isHighScore ? "arcade.highscore" : "arcade.played",
        payload: {
          game: "trivia",
          score,
          userId: user.id,
          displayName: user.displayName,
        },
      })
    );

    result.score = score;
    result.isHighScore = isHighScore;
    result.isPersonalBest = isPersonalBest;
  }

  return NextResponse.json(result);
});
