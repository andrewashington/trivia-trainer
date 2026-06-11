import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  creditWinnings,
  debitStake,
  logRound,
  rollCrashPoint,
  validateBet,
} from "@/modules/arcade/bank";
import { multiplierAt } from "@/modules/crash/curve";
import { startInput } from "@/modules/crash/schema";

/**
 * GET — return the user's active round (safe fields only), or settle a
 * round that already crashed while the user was away.
 *
 * CRITICAL: `crashPoint` is NEVER returned while status is "active".
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();

  const round = await db.crashRound.findFirst({
    where: { userId: user.id, status: "active" },
    select: { id: true, stake: true, startedAt: true, crashPoint: true },
  });

  if (!round) {
    return NextResponse.json({ round: null });
  }

  const elapsedMs = Date.now() - round.startedAt.getTime();
  const currentMultiplier = multiplierAt(elapsedMs);

  // The round has already crashed — settle it as busted now.
  if (currentMultiplier >= round.crashPoint) {
    await db.$transaction(async (tx) => {
      const updated = await tx.crashRound.updateMany({
        where: { id: round.id, status: "active" },
        data: { status: "busted", settledAt: new Date() },
      });
      if (updated.count === 0) return; // already settled by concurrent request
      await logRound(tx, {
        userId: user.id,
        game: "crash",
        stake: round.stake,
        multiplier: 0,
        outcome: "loss",
        net: -round.stake,
      });
    });

    return NextResponse.json({
      round: null,
      justBusted: { crashPoint: round.crashPoint },
    });
  }

  // Round is still live — return safe fields (no crashPoint) plus the
  // server's current time so the client can sync its animation clock.
  return NextResponse.json({
    round: { id: round.id, stake: round.stake, startedAt: round.startedAt },
    serverNow: Date.now(),
  });
});

/**
 * POST — start a new Crash round.
 * Debits the stake, rolls the (secret) crash point, persists the round.
 * Returns { id, stake, startedAt } — NOT the crashPoint.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, startInput);
  const bet = validateBet(body.bet);

  const result = await db.$transaction(async (tx) => {
    // Check for an existing active round.
    const existing = await tx.crashRound.findFirst({
      where: { userId: user.id, status: "active" },
      select: { id: true, stake: true, startedAt: true, crashPoint: true },
    });

    if (existing) {
      const elapsedMs = Date.now() - existing.startedAt.getTime();
      const currentMultiplier = multiplierAt(elapsedMs);

      if (currentMultiplier >= existing.crashPoint) {
        // Round already crashed — settle it and let the player start fresh.
        await tx.crashRound.updateMany({
          where: { id: existing.id, status: "active" },
          data: { status: "busted", settledAt: new Date() },
        });
        await logRound(tx, {
          userId: user.id,
          game: "crash",
          stake: existing.stake,
          multiplier: 0,
          outcome: "loss",
          net: -existing.stake,
        });
      } else {
        // Still live — player must cash out or bust first.
        throw new HttpError(409, "Finish your current round first.");
      }
    }

    // Debit stake and create the new round.
    await debitStake(tx, user.id, bet, "crash.bet", "Crash bet");
    const crashPoint = rollCrashPoint();
    const now = new Date();
    const newRound = await tx.crashRound.create({
      data: {
        userId: user.id,
        stake: bet,
        crashPoint,
        status: "active",
        startedAt: now,
      },
      select: { id: true, stake: true, startedAt: true },
    });

    return { ...newRound, serverNow: now.getTime() };
  });

  // Return the round without crashPoint, plus server time for clock sync.
  return NextResponse.json(result);
});
