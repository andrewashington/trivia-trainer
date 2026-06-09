import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { ideaInput } from "@/modules/ideas/schema";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const ideas = await db.idea.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, displayName: true } },
      votes: { select: { userId: true } },
    },
  });
  return NextResponse.json({
    ideas: ideas.map(({ votes, ...idea }) => ({
      ...idea,
      voteCount: votes.length,
      myVote: votes.some((v) => v.userId === user.id),
    })),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, ideaInput);

  const idea = await withOutbox(
    async (tx) => {
      const idea = await tx.idea.create({
        data: {
          authorId: user.id,
          title: data.title,
          detail: data.detail ?? null,
        },
      });
      // Your own idea starts with your own vote — nobody posts an idea
      // they wouldn't vote for.
      await tx.ideaVote.create({ data: { ideaId: idea.id, userId: user.id } });
      return idea;
    },
    (i) => ({
      type: "idea.created",
      payload: { ideaId: i.id, title: i.title, authorId: user.id },
    })
  );

  return NextResponse.json({ idea }, { status: 201 });
});
