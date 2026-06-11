import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  HOUSE_EDGE,
  MAX_MULTIPLIER,
  creditWinnings,
  debitStake,
  logRound,
  payout,
  rollLimbo,
  validateBet,
} from "@/modules/arcade/bank";
import { limboInput } from "@/modules/limbo/schema";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json({ coins: user.coins });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, limboInput);

  const bet = validateBet(body.bet);

  // Validate target: finite, >= 1.01, <= MAX_MULTIPLIER, round to 2 decimals
  if (!Number.isFinite(body.target)) {
    throw new HttpError(400, "Target must be a finite number.");
  }
  const target = Math.round(body.target * 100) / 100;
  if (target < 1.01) {
    throw new HttpError(400, "Target multiplier must be at least 1.01×.");
  }
  if (target > MAX_MULTIPLIER) {
    throw new HttpError(400, `Target multiplier must be at most ${MAX_MULTIPLIER}×.`);
  }

  const result = await db.$transaction(async (tx) => {
    await debitStake(tx, user.id, bet, "limbo.bet", "Limbo bet");
    const roll = rollLimbo();
    const win = roll >= target;
    const winnings = win ? payout(bet, target * (1 - HOUSE_EDGE)) : 0;
    await creditWinnings(tx, user.id, winnings, "limbo.win", `Limbo ${target.toFixed(2)}× win`);
    const net = winnings - bet;
    await logRound(tx, {
      userId: user.id,
      game: "limbo",
      stake: bet,
      multiplier: win ? target * (1 - HOUSE_EDGE) : 0,
      outcome: win ? "win" : "loss",
      net,
    });
    const me = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } });
    return { roll, win, target, winnings, net, coins: me.coins };
  });

  return NextResponse.json(result);
});
