import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { pollInput } from "@/modules/polls/schema";
import { pollToResults } from "@/modules/polls/results";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const polls = await db.poll.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      options: { orderBy: { order: "asc" } },
      votes: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
      revealVotes: { select: { userId: true } },
    },
  });
  return NextResponse.json({
    polls: polls.map((p) => pollToResults(p, user)),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, pollInput);

  const poll = await withOutbox(
    (tx) =>
      tx.poll.create({
        data: {
          creatorId: user.id,
          question: data.question,
          type: data.type,
          anonymous: data.anonymous,
          sensitive: data.sensitive,
          revealThreshold: data.revealThreshold ?? null,
          options:
            data.type === "scale"
              ? undefined
              : {
                  create: data.options.map((label, order) => ({ label, order })),
                },
        },
      }),
    (p) => ({
      type: "poll.created",
      payload: { pollId: p.id, question: p.question, type: p.type, createdBy: user.id },
    })
  );

  return NextResponse.json({ poll }, { status: 201 });
});
