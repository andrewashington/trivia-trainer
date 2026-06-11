import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { z } from "zod";

const readInput = z.object({ id: z.string().optional() });

/** POST /api/notifications/read — mark one (by id) or all notifications as read. */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { id } = await parseBody(req, readInput);

  if (id) {
    // Mark a single notification read — only if it belongs to this user and is unread.
    await db.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else {
    // Mark all unread notifications for this user as read.
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
});
