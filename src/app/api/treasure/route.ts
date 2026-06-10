import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import {
  GRID_SIZE,
  ensureTreasureDay,
  treasureState,
  utcDay,
} from "@/modules/treasure/state";

const digInput = z.object({
  x: z.number().int().min(0).max(GRID_SIZE - 1),
  y: z.number().int().min(0).max(GRID_SIZE - 1),
});

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json(await treasureState(user.id));
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { x, y } = await parseBody(req, digInput);
  const day = utcDay();

  const result = await db.$transaction(async (tx) => {
    const row = await ensureTreasureDay(tx, day);
    if (row.foundById) {
      throw new HttpError(400, "Today's treasure has already been found. Come back tomorrow.");
    }

    const found = x === row.x && y === row.y;
    try {
      await tx.treasureDig.create({
        data: { day, userId: user.id, x, y, found },
      });
    } catch {
      throw new HttpError(400, "You already dug today. One shovel per day.");
    }

    if (found) {
      await tx.treasureDay.update({
        where: { day },
        data: { foundById: user.id, foundAt: new Date() },
      });
      // The pot varies (rollover), so it's paid here rather than via a
      // fixed COIN_RULES entry — same ledger, same transaction.
      await tx.coinTransaction.create({
        data: {
          userId: user.id,
          amount: row.pot,
          reason: "treasure.found",
          meta: { label: "Found the buried treasure", day, pot: row.pot },
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { coins: { increment: row.pot } },
      });
      await emitOutbox(tx, "treasure.found", {
        userId: user.id,
        userName: user.displayName,
        day,
        pot: row.pot,
        x,
        y,
      });
    } else {
      await emitOutbox(tx, "treasure.dug", {
        userId: user.id,
        userName: user.displayName,
        day,
        x,
        y,
      });
    }

    return { found, pot: row.pot };
  });

  return NextResponse.json({ ...result, state: await treasureState(user.id) });
});
