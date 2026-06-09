import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { rsvpInput } from "@/modules/events/schema";

type Ctx = { params: { id: string } };

export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const event = await db.event.findUnique({ where: { id: params.id } });
  if (!event) throw new HttpError(404, "Event not found.");
  const { status } = await parseBody(req, rsvpInput);

  const rsvp = await withOutbox(
    (tx) =>
      tx.rsvp.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        create: { eventId: event.id, userId: user.id, status },
        update: { status },
      }),
    (r) => ({
      type: "event.rsvp.changed",
      payload: {
        eventId: event.id,
        eventTitle: event.title,
        userId: user.id,
        status: r.status,
      },
    })
  );

  return NextResponse.json({ rsvp });
});
