import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, assertCanModify, requireUser } from "@/lib/session";

export const DELETE = apiHandler(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const user = await requireUser();
    const list = await db.tierList.findUnique({ where: { id: params.id } });
    if (!list) throw new HttpError(404, "Tier list not found.");
    assertCanModify(user, list.creatorId);

    await withOutbox(
      (tx) => tx.tierList.delete({ where: { id: list.id } }),
      () => ({
        type: "tierlist.deleted",
        payload: { listId: list.id, title: list.title, userId: user.id },
      })
    );

    return NextResponse.json({ ok: true });
  }
);
