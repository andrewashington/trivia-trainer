import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  creditWinnings,
  logRound,
  payout,
} from "@/modules/arcade/bank";
import { multiplierAt } from "@/modules/crash/curve";

/**
 * POST /api/crash/cashout — attempt to cash out the active round.
 *
 * Server recomputes the live multiplier at the exact moment the request
 * arrives and compares to the hidden crashPoint:
 *   - If the round has already crashed: settle busted, return { busted: true }.
 *   - If still live: credit winnings, settle cashed, return result.
 *
 * A status-guarded `updateMany` ensures two concurrent taps can never
 * both pay out — if the round was already settled the guard hits 0 rows
 * and we throw 409.
 */
export const POST = apiHandler(async () => {
  const user = await requireUser();

  const result = await db.$transaction(async (tx) => {
    // Load the active round.
    const round = await tx.crashRound.findFirst({
      where: { userId: user.id, status: "active" },
      select: {
        id: true,
        stake: true,
        startedAt: true,
        crashPoint: true,
      },
    });

    if (!round) {
      throw new HttpError(404, "No active round found.");
    }

    const now = Date.now();
    const elapsedMs = now - round.startedAt.getTime();
    const m = multiplierAt(elapsedMs);
    const settledAt = new Date(now);

    if (m >= round.crashPoint) {
      // Too late — the multiplier has already passed the crash point.
      const updated = await tx.crashRound.updateMany({
        where: { id: round.id, status: "active" },
        data: { status: "busted", settledAt },
      });
      if (updated.count === 0) {
        throw new HttpError(409, "Round already settled.");
      }

      await logRound(tx, {
        userId: user.id,
        game: "crash",
        stake: round.stake,
        multiplier: 0,
        outcome: "loss",
        net: -round.stake,
      });

      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { coins: true },
      });

      return {
        busted: true as const,
        crashPoint: round.crashPoint,
        coins: me.coins,
      };
    }

    // In time — cash out at the current (floored) multiplier.
    const mult = Math.min(m, round.crashPoint);
    const winnings = payout(round.stake, mult);
    const net = winnings - round.stake;

    const updated = await tx.crashRound.updateMany({
      where: { id: round.id, status: "active" },
      data: { status: "cashed", cashoutMultiplier: mult, settledAt },
    });
    if (updated.count === 0) {
      throw new HttpError(409, "Round already settled.");
    }

    await creditWinnings(
      tx,
      user.id,
      winnings,
      "crash.win",
      `Crash ${mult.toFixed(2)}× cashout`
    );

    await logRound(tx, {
      userId: user.id,
      game: "crash",
      stake: round.stake,
      multiplier: mult,
      outcome: "win",
      net,
    });

    const me = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { coins: true },
    });

    return {
      busted: false as const,
      multiplier: mult,
      winnings,
      net,
      coins: me.coins,
    };
  });

  return NextResponse.json(result);
});
