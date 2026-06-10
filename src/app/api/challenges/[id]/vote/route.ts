import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { isOpen } from "@/modules/challenges/lib";
import { voteInput } from "@/modules/challenges/schema";

type Ctx = { params: { id: string } };

// One vote per member per challenge, changeable while open.
// PUT { entryId } to vote, { entryId: null } to clear.
export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const challenge = await db.challenge.findUnique({ where: { id: params.id } });
  if (!challenge) throw new HttpError(404, "Challenge not found.");
  if (!isOpen(challenge)) throw new HttpError(409, "Voting is closed.");

  const { entryId } = await parseBody(req, voteInput);

  if (entryId === null) {
    await db.challengeVote.deleteMany({
      where: { challengeId: challenge.id, voterId: user.id },
    });
    return NextResponse.json({ myVote: null });
  }

  const entry = await db.challengeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.challengeId !== challenge.id) {
    throw new HttpError(404, "Entry not found.");
  }
  if (entry.userId === user.id) {
    throw new HttpError(403, "Nice try — you can't vote for yourself.");
  }

  await db.challengeVote.upsert({
    where: {
      challengeId_voterId: { challengeId: challenge.id, voterId: user.id },
    },
    create: { challengeId: challenge.id, voterId: user.id, entryId },
    update: { entryId },
  });

  return NextResponse.json({ myVote: entryId });
});
