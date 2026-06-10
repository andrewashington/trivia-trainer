import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const photo = await db.photobookPhoto.findUnique({
    where: { id: params.id },
    include: { file: true },
  });
  if (!photo) throw new HttpError(404, "Photo not found.");
  assertCanModify(user, photo.uploaderId);

  await withOutbox(
    // Deleting the FileObject cascades to the photo + tags.
    (tx) => tx.fileObject.delete({ where: { id: photo.fileId } }),
    () => ({
      type: "photobook.photo.deleted",
      payload: { photoId: photo.id, deletedBy: user.id },
    })
  );
  // Best-effort object cleanup after the DB commit.
  deleteObject(photo.file.storageKey).catch(() => {});
  return NextResponse.json({ ok: true });
});
