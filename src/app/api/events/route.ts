import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { eventInput } from "@/modules/events/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const now = new Date();
  const include = {
    creator: { select: { id: true, displayName: true } },
    rsvps: { include: { user: { select: { id: true, displayName: true } } } },
  } as const;
  const [upcoming, past] = await Promise.all([
    db.event.findMany({
      where: { startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include,
    }),
    db.event.findMany({
      where: { startAt: { lt: now } },
      orderBy: { startAt: "desc" },
      include,
    }),
  ]);
  return NextResponse.json({ upcoming, past });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, eventInput);

  const event = await withOutbox(
    (tx) =>
      tx.event.create({
        data: {
          creatorId: user.id,
          title: data.title,
          description: data.description ?? null,
          location: data.location ?? null,
          startAt: data.startAt,
          endAt: data.endAt ?? null,
        },
      }),
    (e) => ({
      type: "event.created",
      payload: {
        eventId: e.id,
        title: e.title,
        startAt: e.startAt.toISOString(),
        creatorId: user.id,
      },
    })
  );

  return NextResponse.json({ event }, { status: 201 });
});
