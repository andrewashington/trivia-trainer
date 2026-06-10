import type { Challenge } from "@prisma/client";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";

/** A challenge is open until it's manually closed or its deadline passes. */
export function isOpen(
  c: Pick<Challenge, "closedAt" | "deadline">,
  now = new Date()
): boolean {
  if (c.closedAt) return false;
  if (c.deadline && c.deadline.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Settle a closed challenge exactly once: pick the most-voted entry
 * (ties: earliest entry wins), record it, and emit challenge.won —
 * which pays the winner coins via the outbox coin rule.
 *
 * Idempotent: the first statement claims `settledAt` with an atomic
 * updateMany; concurrent/lazy callers see count 0 and bail. Safe to
 * call from the manual-close route AND lazily on page views after a
 * deadline passes.
 */
export async function settleChallenge(challengeId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const claimed = await tx.challenge.updateMany({
      where: { id: challengeId, settledAt: null },
      data: { settledAt: new Date() },
    });
    if (claimed.count === 0) return; // already settled (or settling)

    const challenge = await tx.challenge.findUniqueOrThrow({
      where: { id: challengeId },
    });
    const entries = await tx.challengeEntry.findMany({
      where: { challengeId },
      include: { _count: { select: { votes: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (entries.length === 0) return; // settled with no winner

    const winner = entries.reduce((best, e) =>
      e._count.votes > best._count.votes ? e : best
    );

    await tx.challenge.update({
      where: { id: challengeId },
      data: { winnerEntryId: winner.id },
    });
    await emitOutbox(tx, "challenge.won", {
      challengeId,
      title: challenge.title,
      winnerId: winner.userId,
      entryId: winner.id,
      votes: winner._count.votes,
    });
  });
}

/**
 * Lazy settlement sweep for read paths: settle any challenge whose
 * deadline has passed but that nobody has settled yet.
 */
export async function settleOverdue(): Promise<void> {
  const overdue = await db.challenge.findMany({
    where: { settledAt: null, deadline: { lte: new Date() } },
    select: { id: true },
  });
  for (const c of overdue) await settleChallenge(c.id);
}
