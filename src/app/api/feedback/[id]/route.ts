import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireAdmin } from "@/lib/session";

type Ctx = { params: { id: string } };

const patch = z.object({ resolved: z.boolean() });

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { resolved } = await parseBody(req, patch);
  const existing = await db.feedback.findUnique({ where: { id: params.id } });
  if (!existing) throw new HttpError(404, "Feedback not found.");
  const feedback = await db.feedback.update({
    where: { id: params.id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  return NextResponse.json({ feedback: { id: feedback.id, resolvedAt: feedback.resolvedAt } });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  await db.feedback.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
