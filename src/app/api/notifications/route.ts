import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** GET /api/notifications — the user's 20 most recent notifications + unread count. */
export const GET = apiHandler(async () => {
  const user = await requireUser();

  const [notifications, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        actorId: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unread });
});
