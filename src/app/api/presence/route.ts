import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** Anyone whose heartbeat landed inside this window counts as "online". */
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/**
 * Heartbeat + roster in one round trip: stamp the caller's lastSeenAt,
 * return everyone else currently online. The shell widget polls this.
 */
export const POST = apiHandler(async () => {
  const user = await requireUser();
  const now = new Date();
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: now } });

  const online = await db.user.findMany({
    where: {
      id: { not: user.id },
      lastSeenAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MS) },
    },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, displayName: true, avatarUrl: true },
  });

  return NextResponse.json({ online });
});
