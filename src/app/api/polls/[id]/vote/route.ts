import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { pollVoteInput } from "@/modules/polls/schema";

type Ctx = { params: { id: string } };

// Cast (or change) your ballot. Replaces all of the caller's previous
// votes for this poll in one transaction — idempotent and re-votable
// while the poll is open.
export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const poll = await db.poll.findUnique({
    where: { id: params.id },
    include: { options: true },
  });
  if (!poll) throw new HttpError(404, "Poll not found.");
  if (poll.closedAt) throw new HttpError(409, "This poll is closed.");

  const ballot = await parseBody(req, pollVoteInput);

  if (poll.type === "scale") {
    if (ballot.rating === undefined) {
      throw new HttpError(400, "This poll wants a 1–5 rating.");
    }
  } else {
    const optionIds = ballot.optionIds ?? [];
    if (optionIds.length === 0) {
      throw new HttpError(400, "Pick an option.");
    }
    if (poll.type === "single" && optionIds.length > 1) {
      throw new HttpError(400, "Pick exactly one.");
    }
    const valid = new Set(poll.options.map((o) => o.id));
    if (!optionIds.every((id) => valid.has(id))) {
      throw new HttpError(400, "Unknown option.");
    }
  }

  await withOutbox(
    async (tx) => {
      await tx.pollVote.deleteMany({ where: { pollId: poll.id, userId: user.id } });
      if (poll.type === "scale") {
        await tx.pollVote.create({
          data: { pollId: poll.id, userId: user.id, rating: ballot.rating! },
        });
      } else {
        await tx.pollVote.createMany({
          data: ballot.optionIds!.map((optionId) => ({
            pollId: poll.id,
            userId: user.id,
            optionId,
          })),
        });
      }
    },
    // Anonymous polls never put the voter in the outbox either.
    () => ({
      type: "poll.voted",
      payload: poll.anonymous
        ? { pollId: poll.id, question: poll.question }
        : { pollId: poll.id, question: poll.question, voterId: user.id },
    })
  );

  return NextResponse.json({ ok: true });
});
