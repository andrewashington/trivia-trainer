import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { maxFileSizeBytes, presignUpload } from "@/lib/storage";
import { photoUploadRequest } from "@/modules/photobook/schema";

// Records the FileObject + PhotobookPhoto (+ tags) and returns a
// presigned PUT URL — same direct-to-storage flow as the files module.
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, photoUploadRequest);

  const cap = maxFileSizeBytes();
  if (data.sizeBytes > cap) {
    throw new HttpError(
      413,
      `Photo too big — the cap is ${Math.floor(cap / 1024 / 1024)} MB.`
    );
  }

  // Only tag real members.
  const taggedIds = [...new Set(data.taggedUserIds)];
  if (taggedIds.length > 0) {
    const found = await db.user.count({ where: { id: { in: taggedIds } } });
    if (found !== taggedIds.length) {
      throw new HttpError(400, "One of the tagged people doesn't exist.");
    }
  }

  const storageKey = `photobook/${randomUUID()}-${data.filename.replace(/[^\w.\-]+/g, "_")}`;

  const photo = await withOutbox(
    async (tx) => {
      const file = await tx.fileObject.create({
        data: {
          uploaderId: user.id,
          filename: data.filename,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          storageKey,
        },
      });
      return tx.photobookPhoto.create({
        data: {
          uploaderId: user.id,
          fileId: file.id,
          caption: data.caption || null,
          sensitive: data.sensitive,
          tags: { create: taggedIds.map((userId) => ({ userId })) },
        },
        include: { tags: true },
      });
    },
    (p) => ({
      type: "photobook.photo.added",
      payload: {
        photoId: p.id,
        uploaderId: user.id,
        caption: p.caption,
        taggedUserIds: taggedIds,
      },
    })
  );

  const uploadUrl = await presignUpload(storageKey, data.mimeType);
  return NextResponse.json({ photo, uploadUrl }, { status: 201 });
});
