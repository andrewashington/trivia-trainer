import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { wishlistItemInput } from "@/modules/wishlist/schema";

type Ctx = { params: { id: string } };

async function findItem(id: string) {
  const item = await db.wishlistItem.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, "Wishlist item not found.");
  return item;
}

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findItem(params.id);
  assertCanModify(user, existing.userId);
  const data = await parseBody(req, wishlistItemInput.partial());

  const item = await db.wishlistItem.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json({ item });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findItem(params.id);
  assertCanModify(user, existing.userId);

  await withOutbox(
    (tx) => tx.wishlistItem.delete({ where: { id: existing.id } }),
    () => ({
      type: "wishlist.removed",
      payload: { itemId: existing.id, userId: existing.userId, title: existing.title },
    })
  );
  return NextResponse.json({ ok: true });
});
