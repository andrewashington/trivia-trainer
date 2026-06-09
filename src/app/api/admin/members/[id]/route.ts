import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireAdmin } from "@/lib/session";
import { memberPatch } from "@/modules/admin/schema";

type Ctx = { params: { id: string } };

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const data = await parseBody(req, memberPatch);

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) throw new HttpError(404, "Member not found.");
  // Self-demotion lockout guard: never let the last admin demote themself.
  if (target.role === "admin" && data.role === "member") {
    const adminCount = await db.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      throw new HttpError(409, "Can't demote the only admin.");
    }
  }

  const member = await db.user.update({
    where: { id: target.id },
    data,
    select: { id: true, email: true, displayName: true, role: true },
  });
  void admin;
  return NextResponse.json({ member });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) throw new HttpError(404, "Member not found.");
  if (target.id === admin.id) {
    throw new HttpError(409, "You can't remove yourself.");
  }

  // Cascade wipes their sessions, so removal = immediate lockout.
  await withOutbox(
    (tx) => tx.user.delete({ where: { id: target.id } }),
    () => ({
      type: "member.removed",
      payload: { userId: target.id, email: target.email, removedBy: admin.id },
    })
  );
  return NextResponse.json({ ok: true });
});
