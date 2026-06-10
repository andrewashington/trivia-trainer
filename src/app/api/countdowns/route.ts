import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { countdownInput, LANDED_WINDOW_MS } from "@/modules/countdowns/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const countdowns = await db.countdown.findMany({
    where: { targetAt: { gte: new Date(Date.now() - LANDED_WINDOW_MS) } },
    orderBy: { targetAt: "asc" },
    include: { creator: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ countdowns });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, countdownInput);

  const countdown = await withOutbox(
    (tx) =>
      tx.countdown.create({
        data: {
          creatorId: user.id,
          title: data.title,
          emoji: data.emoji ?? null,
          targetAt: data.targetAt,
          link: data.link ?? null,
        },
      }),
    (c) => ({
      type: "countdown.created",
      payload: {
        countdownId: c.id,
        title: c.title,
        emoji: c.emoji,
        targetAt: c.targetAt.toISOString(),
        creatorId: user.id,
      },
    })
  );

  return NextResponse.json({ countdown }, { status: 201 });
});
