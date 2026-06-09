import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { nowPlayingPatch } from "@/modules/nowplaying/schema";

type Ctx = { params: { id: string } };

async function findItem(id: string) {
  const item = await db.nowPlayingItem.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, "Item not found.");
  return item;
}

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findItem(params.id);
  assertCanModify(user, existing.userId);
  const data = await parseBody(req, nowPlayingPatch);

  const item = await withOutbox(
    (tx) => tx.nowPlayingItem.update({ where: { id: existing.id }, data }),
    (i) => ({
      type: "nowplaying.updated",
      payload: {
        action: i.status === "finished" ? "finished" : "edited",
        itemId: i.id,
        userId: existing.userId,
        mediaType: i.mediaType,
        title: i.title,
      },
    })
  );
  return NextResponse.json({ item });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findItem(params.id);
  assertCanModify(user, existing.userId);

  await withOutbox(
    (tx) => tx.nowPlayingItem.delete({ where: { id: existing.id } }),
    () => ({
      type: "nowplaying.updated",
      payload: {
        action: "removed",
        itemId: existing.id,
        userId: existing.userId,
        title: existing.title,
      },
    })
  );
  return NextResponse.json({ ok: true });
});
