import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { presignUpload } from "@/lib/storage";
import { listingImageRequest } from "@/modules/marketplace/schema";

export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const { mimeType } = await parseBody(req, listingImageRequest);
  const ext = mimeType.split("/")[1];
  const key = `marketplace/${randomUUID()}.${ext}`;
  const uploadUrl = await presignUpload(key, mimeType);
  return NextResponse.json({ key, uploadUrl });
});
