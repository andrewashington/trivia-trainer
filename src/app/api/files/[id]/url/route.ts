import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { presignDownload } from "@/lib/storage";

type Ctx = { params: { id: string } };

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  const file = await db.fileObject.findUnique({ where: { id: params.id } });
  if (!file) throw new HttpError(404, "File not found.");
  const url = await presignDownload(file.storageKey, file.filename);
  return NextResponse.json({ url });
});
