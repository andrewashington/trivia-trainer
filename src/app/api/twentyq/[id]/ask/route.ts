import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { QUESTION_BUDGET, askSchema } from "@/modules/twentyq/schema";
import { gameInclude, gamePayload, loadGame } from "@/modules/twentyq/server";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const { kind, text } = await parseBody(req, askSchema);

  const game = await loadGame(id);
  if (game.hostId === user.id)
    throw new HttpError(403, "You're the host. You already know the answer.");
  if (game.status !== "active") throw new HttpError(400, "This round is over.");
  if (kind === "question" && game.answered >= QUESTION_BUDGET)
    throw new HttpError(400, "That's all twenty. Guess or go home.");

  const updated = await db.$transaction(async (tx) => {
    // Re-check inside the tx so the round can't end out from under us.
    const fresh = await tx.twentyQuestionsGame.findUnique({ where: { id: game.id } });
    if (!fresh || fresh.status !== "active") throw new HttpError(400, "This round is over.");
    if (kind === "question" && fresh.answered >= QUESTION_BUDGET)
      throw new HttpError(400, "That's all twenty. Guess or go home.");

    await tx.twentyQuestionsEntry.create({
      data: { gameId: game.id, askerId: user.id, kind, text },
    });

    // Nudge the host: there's something waiting on their verdict.
    await tx.notification.create({
      data: {
        userId: game.hostId,
        type: "twentyq",
        actorId: user.id,
        targetType: "twentyq",
        targetId: game.id,
        title:
          kind === "guess"
            ? `${user.displayName} took a guess in your round of 20 Questions`
            : `${user.displayName} asked a question in your round of 20 Questions`,
        body: text.slice(0, 160),
        href: `/twentyq/${game.id}`,
      },
    });

    return tx.twentyQuestionsGame.findUniqueOrThrow({
      where: { id: game.id },
      include: gameInclude,
    });
  });

  return NextResponse.json({ game: gamePayload(updated, user.id) }, { status: 201 });
});
