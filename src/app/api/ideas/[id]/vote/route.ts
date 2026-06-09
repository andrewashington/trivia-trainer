import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { ideaVoteInput } from "@/modules/ideas/schema";

type Ctx = { params: { id: string } };

// Idempotent vote toggle: PUT { voted: true | false }.
export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const idea = await db.idea.findUnique({ where: { id: params.id } });
  if (!idea) throw new HttpError(404, "Idea not found.");
  const { voted } = await parseBody(req, ideaVoteInput);

  const voteCount = await withOutbox(
    async (tx) => {
      if (voted) {
        await tx.ideaVote.upsert({
          where: { ideaId_userId: { ideaId: idea.id, userId: user.id } },
          create: { ideaId: idea.id, userId: user.id },
          update: {},
        });
      } else {
        await tx.ideaVote.deleteMany({
          where: { ideaId: idea.id, userId: user.id },
        });
      }
      return tx.ideaVote.count({ where: { ideaId: idea.id } });
    },
    (count) => ({
      type: "idea.vote.changed",
      payload: { ideaId: idea.id, title: idea.title, userId: user.id, voted, voteCount: count },
    })
  );

  return NextResponse.json({ voteCount, myVote: voted });
});
