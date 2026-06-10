import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { voteInput } from "@/modules/smash/schema";

type Ctx = { params: { id: string } };

export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const card = await db.smashCard.findUnique({ where: { id: params.id } });
  if (!card) throw new HttpError(404, "Card not found.");
  const { verdict } = await parseBody(req, voteInput);

  await withOutbox(
    (tx) =>
      tx.smashVote.upsert({
        where: { cardId_userId: { cardId: card.id, userId: user.id } },
        create: { cardId: card.id, userId: user.id, verdict },
        update: { verdict },
      }),
    () => ({
      type: "smash.voted",
      payload: { cardId: card.id, deckId: card.deckId, userId: user.id, verdict },
    })
  );

  const votes = await db.smashVote.findMany({
    where: { cardId: card.id },
    select: { userId: true, verdict: true },
  });
  return NextResponse.json({
    smash: votes.filter((v) => v.verdict === "smash").length,
    pass: votes.filter((v) => v.verdict === "pass").length,
    myVerdict: verdict,
  });
});
