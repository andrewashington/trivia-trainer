import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { mapPinInput } from "@/modules/map/schema";

type Ctx = { params: { id: string } };

async function findPin(id: string) {
  const pin = await db.mapPin.findUnique({ where: { id } });
  if (!pin) throw new HttpError(404, "Pin not found.");
  return pin;
}

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findPin(params.id);
  assertCanModify(user, existing.creatorId);
  const data = await parseBody(req, mapPinInput.partial());

  const pin = await db.mapPin.update({ where: { id: existing.id }, data });
  return NextResponse.json({ pin });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findPin(params.id);
  assertCanModify(user, existing.creatorId);

  await withOutbox(
    (tx) => tx.mapPin.delete({ where: { id: existing.id } }),
    () => ({
      type: "map.pin.removed",
      payload: { pinId: existing.id, name: existing.name, removedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
