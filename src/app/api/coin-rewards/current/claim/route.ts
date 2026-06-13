import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { claimKeyFor, findRewardEffective, rewardLedgerMeta } from "@/lib/coinRewards";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";

const Body = z.object({ key: z.string().min(1) });

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { key } = await parseBody(req, Body);
  const reward = await findRewardEffective(key);
  if (!reward) throw new HttpError(404, "No such reward.");

  // Daily campaigns fold the calendar day into the claim key, so each day is a
  // fresh row the unique index treats as un-claimed.
  const claimKey = claimKeyFor(reward);

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.coinRewardClaim.findUnique({
        where: { userId_rewardKey: { userId: user.id, rewardKey: claimKey } },
      });
      if (existing) {
        const fresh = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { coins: true },
        });
        return { claimed: false, coins: fresh.coins };
      }

      await tx.coinRewardClaim.create({
        data: { userId: user.id, rewardKey: claimKey, amount: reward.amount },
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
