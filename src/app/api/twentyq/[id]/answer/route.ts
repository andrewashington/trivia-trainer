import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { QUESTION_BUDGET, answerSchema } from "@/modules/twentyq/schema";
import { gameInclude, gamePayload, loadGame } from "@/modules/twentyq/server";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const input = await parseBody(req, answerSchema);

  const game = await loadGame(id);
  if (game.hostId !== user.id) throw new HttpError(403, "Only the host calls these.");
  if (game.status !== "active") throw new HttpError(400, "This round is already over.");

  const updated = await db.$transaction(async (tx) => {
    // Re-read under the tx — two correct judgements can't both land.
    const fresh = await tx.twentyQuestionsGame.findUnique({ where: { id: game.id } });
    if (!fresh || fresh.status !== "active") throw new HttpError(400, "This round is already over.");

    // --- Reveal / give up: end with no winner, secret comes out. ---
    if (input.reveal) {
      await tx.twentyQuestionsGame.update({
        where: { id: game.id },
        data: { status: "revealed", endedAt: new Date() },
      });
      return tx.twentyQuestionsGame.findUniqueOrThrow({
        where: { id: game.id },
        include: gameInclude,
      });
    }

    const entry = await tx.twentyQuestionsEntry.findUnique({ where: { id: input.entryId! } });
    if (!entry || entry.gameId !== game.id) throw new HttpError(404, "No such entry.");

    // --- Answer a question (yes/no/sometimes), tick the budget. ---
    if (entry.kind === "question") {
      if (input.answer === undefined) throw new HttpError(400, "Pick an answer.");
      if (entry.answer !== null) throw new HttpError(400, "Already answered.");
      if (fresh.answered >= QUESTION_BUDGET)
        throw new HttpError(400, "That's all twenty. Make them guess.");
      await tx.twentyQuestionsEntry.update({
        where: { id: entry.id },
        data: { answer: input.answer },
      });
      await tx.twentyQuestionsGame.update({
        where: { id: game.id },
        data: { answered: { increment: 1 } },
      });
      return tx.twentyQuestionsGame.findUniqueOrThrow({
        where: { id: game.id },
        include: gameInclude,
      });
    }

    // --- Judge a guess. ---
    if (input.correct === undefined) throw new HttpError(400, "Correct or wrong?");
    if (entry.correct !== null) throw new HttpError(400, "Already judged.");
    await tx.twentyQuestionsEntry.update({
      where: { id: entry.id },
      data: { correct: input.correct },
    });

    if (input.correct) {
      await tx.twentyQuestionsGame.update({
        where: { id: game.id },
        data: { status: "solved", winnerId: entry.askerId, endedAt: new Date() },
      });
      await emitOutbox(tx, "twentyq.solved", { winnerId: entry.askerId, gameId: game.id });
      await tx.notification.create({
        data: {
          userId: entry.askerId,
          type: "twentyq",
          actorId: user.id,
          targetType: "twentyq",
          targetId: game.id,
          title: "You cracked it! Your guess won the round of 20 Questions.",
          body: entry.text.slice(0, 160),
          href: `/twentyq/${game.id}`,
        },
      });
    }

    return tx.twentyQuestionsGame.findUniqueOrThrow({
      where: { id: game.id },
      include: gameInclude,
    });
  });

  return NextResponse.json({ game: gamePayload(updated, user.id) });
});
