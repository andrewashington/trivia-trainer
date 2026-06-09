import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const forfeit = await db.forfeit.findUnique({ where: { id: params.id } });
  if (!forfeit) throw new HttpError(404, "Forfeit not found.");
  assertCanModify(user, forfeit.authorId);
  await db.forfeit.delete({ where: { id: forfeit.id } });
  return NextResponse.json({ ok: true });
});
