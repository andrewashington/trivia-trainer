import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { eventPatch } from "@/modules/events/schema";

type Ctx = { params: { id: string } };

async function findEvent(id: string) {
  const event = await db.event.findUnique({ where: { id } });
  if (!event) throw new HttpError(404, "Event not found.");
  return event;
}

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findEvent(params.id);
  assertCanModify(user, existing.creatorId);
  const data = await parseBody(req, eventPatch);

  const event = await withOutbox(
    (tx) => tx.event.update({ where: { id: existing.id }, data }),
    (e) => ({
      type: "event.updated",
      payload: { eventId: e.id, title: e.title, editedBy: user.id },
    })
  );
  return NextResponse.json({ event });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findEvent(params.id);
  assertCanModify(user, existing.creatorId);

  await withOutbox(
    (tx) => tx.event.delete({ where: { id: existing.id } }),
    () => ({
      type: "event.deleted",
      payload: { eventId: existing.id, title: existing.title, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
