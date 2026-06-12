import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { creditWinnings, debitStake, logRound, payout, validateBet } from "@/modules/arcade/bank";
import { spin } from "@/modules/slots/engine";
import { slotsInput, type SlotsSpinResult } from "@/modules/slots/schema";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json({ coins: user.coins });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, slotsInput);
  const bet = validateBet(body.bet);

  const result = await db.$transaction(async (tx): Promise<SlotsSpinResult> => {
    await debitStake(tx, user.id, bet, "slots.bet", "Slots spin");

    // All randomness server-side.
    const { reels, multiplier, jackpot } = spin();
    const win = multiplier > 0;
    const winnings = win ? payout(bet, multiplier) : 0;

    await creditWinnings(
      tx,
      user.id,
      winnings,
      "slots.win",
      jackpot ? "Slots JACKPOT" : `Slots ${multiplier}× win`
    );

    const net = winnings - bet;
    await logRound(tx, {
      userId: user.id,
      game: "slots",
      stake: bet,
      multiplier: win ? multiplier : 0,
      outcome: win ? "win" : "loss",
      net,
    });

    const me = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } });
    return { reels, multiplier, winnings, net, coins: me.coins, jackpot };
  });

  return NextResponse.json(result);
});
