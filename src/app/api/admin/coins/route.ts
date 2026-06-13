import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireAdmin } from "@/lib/session";
import { coinAdjust } from "@/modules/admin/schema";

/** GET /api/admin/coins?userId= — a member's balance + recent ledger rows. */
export const GET = apiHandler(async (req: Request) => {
  await requireAdmin();
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) throw new HttpError(400, "userId required.");

  const [user, ledger] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, coins: true } }),
    db.coinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, amount: true, reason: true, meta: true, createdAt: true },
    }),
  ]);
  if (!user) throw new HttpError(404, "No such member.");

  return NextResponse.json({
    coins: user.coins,
    ledger: ledger.map((t) => ({
      id: t.id,
      amount: t.amount,
      reason: t.reason,
      label: (t.meta as { label?: string } | null)?.label ?? t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/admin/coins — hand-credit or dock a member's balance. Writes a
 * CoinTransaction (reason "admin.adjustment") and the denormalized
 * User.coins in one transaction, exactly like applyCoinRule. Won't drive a
 * balance below zero.
 */
export const POST = apiHandler(async (req: Request) => {
  const admin = await requireAdmin();
  const { userId, amount, note } = await parseBody(req, coinAdjust);

  const coins = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
    if (!target) throw new HttpError(404, "No such member.");
    if (target.coins + amount < 0) {
      throw new HttpError(409, `That would leave a negative balance (${target.coins} on hand).`);
    }
    await tx.coinTransaction.create({
      data: {
        userId,
        amount,
        reason: "admin.adjustment",
        meta: { label: note, by: admin.id, byName: admin.displayName },
      },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { coins: { increment: amount } },
      select: { coins: true },
    });
    return updated.coins;
  });

  return NextResponse.json({ ok: true, coins });
});
