import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const file = await db.fileObject.findUnique({ where: { id: params.id } });
  if (!file) throw new HttpError(404, "File not found.");
  assertCanModify(user, file.uploaderId);

  await withOutbox(
    (tx) => tx.fileObject.delete({ where: { id: file.id } }),
    () => ({
      type: "file.deleted",
      payload: { fileId: file.id, filename: file.filename, deletedBy: user.id },
    })
  );
  // Best-effort object cleanup after the DB commit.
  deleteObject(file.storageKey).catch(() => {});
  return NextResponse.json({ ok: true });
});
