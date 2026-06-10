import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { maxFileSizeBytes, presignUpload } from "@/lib/storage";
import { isOpen } from "@/modules/challenges/lib";
import { entryInput } from "@/modules/challenges/schema";

type Ctx = { params: { id: string } };

// Submit your entry: text proof and/or a photo. Photos reuse the files
// module's direct-to-storage flow — we record the FileObject and hand
// back a presigned PUT URL for the browser.
export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const challenge = await db.challenge.findUnique({ where: { id: params.id } });
  if (!challenge) throw new HttpError(404, "Challenge not found.");
  if (!isOpen(challenge)) throw new HttpError(409, "This challenge is closed.");

  const data = await parseBody(req, entryInput);

  const existing = await db.challengeEntry.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId: user.id } },
  });
  if (existing) throw new HttpError(409, "You already entered — one entry each.");

  if (data.photo) {
    const cap = maxFileSizeBytes();
    if (data.photo.sizeBytes > cap) {
      throw new HttpError(
        413,
        `Photo too big — the cap is ${Math.floor(cap / 1024 / 1024)} MB.`
      );
    }
  }

  const storageKey = data.photo
    ? `challenges/${randomUUID()}-${data.photo.filename.replace(/[^\w.\-]+/g, "_")}`
    : null;

  const entry = await withOutbox(
    async (tx) => {
      let fileId: string | null = null;
      if (data.photo && storageKey) {
        const file = await tx.fileObject.create({
          data: {
            uploaderId: user.id,
            filename: data.photo.filename,
            mimeType: data.photo.mimeType,
            sizeBytes: data.photo.sizeBytes,
            storageKey,
          },
        });
        fileId = file.id;
      }
      return tx.challengeEntry.create({
        data: {
          challengeId: challenge.id,
          userId: user.id,
          text: data.text || null,
          fileId,
        },
      });
    },
    (e) => ({
      type: "challenge.entry.submitted",
      payload: {
        challengeId: challenge.id,
        title: challenge.title,
        entryId: e.id,
        userId: user.id,
        hasPhoto: !!e.fileId,
      },
    })
  );

  const uploadUrl =
    data.photo && storageKey
      ? await presignUpload(storageKey, data.photo.mimeType)
      : null;

  return NextResponse.json({ entry, uploadUrl }, { status: 201 });
});
