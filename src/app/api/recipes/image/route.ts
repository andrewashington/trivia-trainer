import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { presignUpload } from "@/lib/storage";
import { recipeImageRequest } from "@/modules/cookbook/schema";

// Presign a recipe-image upload. The returned key goes into the recipe's
// imageKey on create/edit.
export const POST = apiHandler(async (req: Request) => {
  await requireUser();
  const { mimeType } = await parseBody(req, recipeImageRequest);
  const ext = mimeType.split("/")[1];
  const key = `recipes/${randomUUID()}.${ext}`;
  const uploadUrl = await presignUpload(key, mimeType);
  return NextResponse.json({ key, uploadUrl });
});
