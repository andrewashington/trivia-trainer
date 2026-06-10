import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const comment = await db.comment.findUnique({ where: { id: params.id } });
  if (!comment) throw new HttpError(404, "Comment not found.");
  assertCanModify(user, comment.authorId);

  await withOutbox(
    (tx) => tx.comment.delete({ where: { id: comment.id } }),
    () => ({
      type: "comment.deleted",
      payload: {
        commentId: comment.id,
        targetType: comment.targetType,
        targetId: comment.targetId,
        deletedBy: user.id,
      },
    })
  );

  return NextResponse.json({ ok: true });
});
