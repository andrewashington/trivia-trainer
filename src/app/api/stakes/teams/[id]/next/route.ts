import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { nextEventForTeam } from "@/lib/sportsdb";

type Ctx = { params: { id: string } };

/**
 * A team's next scheduled game. Upserts the fixture into our DB so the
 * claim that gets created against it references a row we own — the bet
 * is then settled from our copy, never a live re-fetch of the schedule.
 */
export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser();

  let event;
  try {
    event = await nextEventForTeam(params.id);
  } catch {
    throw new HttpError(502, "The sports oracle isn't answering — try again in a minute.");
  }
  if (!event) {
    throw new HttpError(404, "No upcoming game found for that team (off-season?).");
  }

  const fixture = await db.fixture.upsert({
    where: { id: event.id },
    create: {
      id: event.id,
      league: event.league,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startsAt: event.startsAt,
    },
    // Never touch scores here — settlement owns those.
    update: {
      league: event.league,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startsAt: event.startsAt,
      fetchedAt: new Date(),
    },
  });

  return NextResponse.json({
    fixture: {
      id: fixture.id,
      league: fixture.league,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      startsAt: fixture.startsAt.toISOString(),
    },
  });
});
