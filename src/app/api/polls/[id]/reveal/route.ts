import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

/** Toggle the caller's "reveal the results" ballot on a sealed poll. */
export const PUT = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const poll = await db.poll.findUnique({
    where: { id: params.id },
    include: { revealVotes: true },
  });
  if (!poll) throw new HttpError(404, "Poll not found.");
  if (poll.revealThreshold === null) {
    throw new HttpError(400, "This poll's results aren't sealed.");
  }

  const mine = poll.revealVotes.find((v) => v.userId === user.id);
  if (mine) {
    await db.pollRevealVote.delete({ where: { id: mine.id } });
    return NextResponse.json({ voted: false, count: poll.revealVotes.length - 1 });
  }

  const count = poll.revealVotes.length + 1;
  if (count >= poll.revealThreshold) {
    // Threshold met: record the deciding ballot and announce the unseal.
    await withOutbox(
      (tx) =>
        tx.pollRevealVote.create({ data: { pollId: poll.id, userId: user.id } }),
      () => ({
        type: "poll.results.revealed",
        payload: { pollId: poll.id, question: poll.question, votes: count },
      })
    );
  } else {
    await db.pollRevealVote.create({ data: { pollId: poll.id, userId: user.id } });
  }
  return NextResponse.json({ voted: true, count });
});
