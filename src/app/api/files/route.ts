import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { maxFileSizeBytes, presignUpload } from "@/lib/storage";
import { fileUploadRequest } from "@/modules/files/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const files = await db.fileObject.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ files });
});

// Validates, records the FileObject, and returns a presigned PUT URL the
// browser uploads to directly — the file never passes through the app.
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, fileUploadRequest);

  const cap = maxFileSizeBytes();
  if (data.sizeBytes > cap) {
    throw new HttpError(
      413,
      `File too big — the cap is ${Math.floor(cap / 1024 / 1024)} MB.`
    );
  }

  const storageKey = `files/${randomUUID()}-${data.filename.replace(/[^\w.\-]+/g, "_")}`;

  const file = await withOutbox(
    (tx) =>
      tx.fileObject.create({
        data: {
          uploaderId: user.id,
          filename: data.filename,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          storageKey,
        },
      }),
    (f) => ({
      type: "file.uploaded",
      payload: { fileId: f.id, filename: f.filename, uploaderId: user.id },
    })
  );

  const uploadUrl = await presignUpload(storageKey, data.mimeType);
  return NextResponse.json({ file, uploadUrl }, { status: 201 });
});
