import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { challengeInput } from "@/modules/challenges/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const challenges = await db.challenge.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true } },
      _count: { select: { entries: true } },
    },
  });
  return NextResponse.json({ challenges });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, challengeInput);

  const deadline = data.deadline ? new Date(data.deadline) : null;
  if (deadline && deadline.getTime() <= Date.now()) {
    throw new HttpError(400, "The deadline has to be in the future.");
  }

  const challenge = await withOutbox(
    (tx) =>
      tx.challenge.create({
        data: {
          creatorId: user.id,
          title: data.title,
          description: data.description ?? null,
          deadline,
        },
      }),
    (c) => ({
      type: "challenge.created",
      payload: {
        challengeId: c.id,
        title: c.title,
        creatorId: user.id,
        deadline: c.deadline?.toISOString() ?? null,
      },
    })
  );

  return NextResponse.json({ challenge }, { status: 201 });
});
