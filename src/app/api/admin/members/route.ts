import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireAdmin } from "@/lib/session";
import { memberAdd } from "@/modules/admin/schema";

export const GET = apiHandler(async () => {
  await requireAdmin();
  const members = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ members });
});

// Adding a member = adding to the allowlist. They can then sign in.
export const POST = apiHandler(async (req: Request) => {
  const admin = await requireAdmin();
  const data = await parseBody(req, memberAdd);

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) throw new HttpError(409, "That email is already a member.");

  const member = await withOutbox(
    (tx) =>
      tx.user.create({
        data: { email: data.email, displayName: data.displayName },
      }),
    (u) => ({
      type: "member.added",
      payload: { userId: u.id, email: u.email, addedBy: admin.id },
    })
  );

  return NextResponse.json({ member }, { status: 201 });
});
