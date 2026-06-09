import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { pollPatch } from "@/modules/polls/schema";

type Ctx = { params: { id: string } };

async function findPoll(id: string) {
  const poll = await db.poll.findUnique({ where: { id } });
  if (!poll) throw new HttpError(404, "Poll not found.");
  return poll;
}

// Close / reopen (creator or admin).
export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findPoll(params.id);
  assertCanModify(user, existing.creatorId);
  const { closed } = await parseBody(req, pollPatch);

  const poll = await withOutbox(
    (tx) =>
      tx.poll.update({
        where: { id: existing.id },
        data: { closedAt: closed ? new Date() : null },
      }),
    (p) => ({
      type: "poll.closed",
      payload: { pollId: p.id, question: p.question, closed, by: user.id },
    })
  );
  return NextResponse.json({ poll });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findPoll(params.id);
  assertCanModify(user, existing.creatorId);

  await withOutbox(
    (tx) => tx.poll.delete({ where: { id: existing.id } }),
    () => ({
      type: "poll.deleted",
      payload: { pollId: existing.id, question: existing.question, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
