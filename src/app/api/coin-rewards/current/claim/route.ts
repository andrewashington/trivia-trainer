import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { ACTIVE_COIN_REWARD, rewardLedgerMeta } from "@/lib/coinRewards";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";

export const POST = apiHandler(async () => {
  const user = await requireUser();
  const reward = ACTIVE_COIN_REWARD;

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.coinRewardClaim.findUnique({
        where: { userId_rewardKey: { userId: user.id, rewardKey: reward.key } },
      });
      if (existing) {
        const fresh = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { coins: true },
        });
        return { claimed: false, coins: fresh.coins };
      }

      await tx.coinRewardClaim.create({
        data: {
          userId: user.id,
          rewardKey: reward.key,
          amount: reward.amount,
        },
      });
      await tx.coinTransaction.create({
        data: {
          userId: user.id,
          amount: reward.amount,
          reason: "coin.reward.claimed",
          meta: rewardLedgerMeta(reward),
        },
      });
      const fresh = await tx.user.update({
        where: { id: user.id },
        data: { coins: { increment: reward.amount } },
        select: { coins: true },
      });

      return { claimed: true, coins: fresh.coins };
    });

    return NextResponse.json({ ok: true, amount: reward.amount, ...result });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "Already claimed.");
    }
    throw err;
  }
});
