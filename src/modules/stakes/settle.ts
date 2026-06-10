import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { lookupEvent } from "@/lib/sportsdb";

/**
 * The sports oracle. Finds open sports-mode claims whose game should be
 * over, fetches the final score once, freezes it onto our Fixture row,
 * and resolves every claim riding on it. resolvedById stays null — that
 * marks an oracle ruling rather than a human verdict.
 *
 * Called opportunistically from the Stakes page render, throttled here so
 * page loads stay cheap and TheSportsDB stays unbothered.
 */

const CHECK_INTERVAL_MS = 5 * 60_000;
// Don't bother asking for a score until the game has plausibly ended.
const GAME_GRACE_MS = 2 * 60 * 60_000;

let lastCheck = 0;

export async function settleDueSportsClaims(): Promise<void> {
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = Date.now();

  const due = await db.claim.findMany({
    where: {
      outcome: null,
      fixtureId: { not: null },
      fixture: { finished: false, startsAt: { lt: new Date(Date.now() - GAME_GRACE_MS) } },
    },
    include: { fixture: true },
  });
  if (due.length === 0) return;

  // One lookup per distinct game, however many claims ride on it.
  const fixtureIds = [...new Set(due.map((c) => c.fixtureId!))];
  for (const fixtureId of fixtureIds) {
    let event;
    try {
      event = await lookupEvent(fixtureId);
    } catch {
      continue; // oracle down — next page load retries
    }
    if (!event) continue;

    const decided = event.finished && event.homeScore !== null && event.awayScore !== null;
    if (!decided && !event.cancelled) continue; // still in play

    await db.fixture.update({
      where: { id: fixtureId },
      data: {
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        finished: true,
        startsAt: event.startsAt,
      },
    });

    const winner = event.cancelled
      ? null
      : event.homeScore! > event.awayScore!
        ? event.homeTeam
        : event.awayScore! > event.homeScore!
          ? event.awayTeam
          : null; // draw

    for (const claim of due.filter((c) => c.fixtureId === fixtureId)) {
      // Cancelled game → void. A draw means the pick didn't win → wrong.
      const outcome = event.cancelled
        ? "void"
        : claim.pickTeam === winner
          ? "right"
          : "wrong";
      try {
        await withOutbox(
          (tx) =>
            tx.claim.update({
              where: { id: claim.id, outcome: null }, // human verdict wins races
              data: { outcome, resolvedAt: new Date(), resolvedById: null },
            }),
          (c) => ({
            type: "claim.resolved",
            payload: {
              claimId: c.id,
              text: c.text,
              outcome,
              resolvedBy: null,
              oracle: true,
              score: event.cancelled
                ? null
                : `${event.homeTeam} ${event.homeScore}–${event.awayScore} ${event.awayTeam}`,
            },
          })
        );
      } catch {
        // Already resolved by a human between query and update — fine.
      }
    }
  }
}
