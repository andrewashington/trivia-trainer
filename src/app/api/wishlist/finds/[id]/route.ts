import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await db.coolFind.findUnique({ where: { id: params.id } });
  if (!existing) throw new HttpError(404, "Cool find not found.");
  assertCanModify(user, existing.userId);
  await db.coolFind.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
});
