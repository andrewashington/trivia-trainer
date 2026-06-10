import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireAdmin } from "@/lib/session";
import { welcomeNewMember } from "@/lib/welcome";
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

  // Welcome email with a ready-to-click sign-in link. Delivery problems
  // must not roll back membership — they can always use /signin.
  let welcomeEmailSent = true;
  try {
    await welcomeNewMember(member.email, member.displayName);
  } catch (err) {
    welcomeEmailSent = false;
    console.error(`Welcome email to ${member.email} failed:`, err);
  }

  return NextResponse.json({ member, welcomeEmailSent }, { status: 201 });
});
