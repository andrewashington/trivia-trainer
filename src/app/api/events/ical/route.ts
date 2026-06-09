import { createEvents, type EventAttributes } from "ics";
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";

/**
 * Per-user .ics subscription feed. Calendar apps can't send session
 * cookies, so this endpoint authenticates via the user's private
 * icalToken (?token=...) instead — shown only on the Events page.
 */
export const GET = apiHandler(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) throw new HttpError(401, "Missing token.");
  const user = await db.user.findUnique({ where: { icalToken: token } });
  if (!user) throw new HttpError(401, "Invalid token.");

  const events = await db.event.findMany({
    where: { startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    include: { creator: { select: { displayName: true } } },
  });

  const toIcsDate = (d: Date): [number, number, number, number, number] => [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];

  const attrs: EventAttributes[] = events.map((e) => {
    const base = {
      uid: `${e.id}@udmplus`,
      title: e.title,
      description: e.description ?? undefined,
      location: e.location ?? undefined,
      start: toIcsDate(e.startAt),
      startInputType: "utc" as const,
      organizer: { name: e.creator.displayName },
      calName: "UDM+",
    };
    return e.endAt
      ? { ...base, end: toIcsDate(e.endAt), endInputType: "utc" as const }
      : { ...base, duration: { hours: 1 } };
  });

  const { error, value } = createEvents(attrs);
  if (error) throw error;

  return new NextResponse(value ?? "", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="udmplus.ics"',
    },
  });
});
