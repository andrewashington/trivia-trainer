import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

// Typos happen; feats of strength are occasionally retracted.
export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const pr = await db.fitnessPr.findUnique({ where: { id: params.id } });
  if (!pr) throw new HttpError(404, "No such feat on record.");
  assertCanModify(user, pr.userId);
  await db.fitnessPr.delete({ where: { id: pr.id } });
  return NextResponse.json({ ok: true });
});
