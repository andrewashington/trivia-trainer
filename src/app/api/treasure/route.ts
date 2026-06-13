import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { spendCoins, creditWinnings } from "@/modules/arcade/bank";
import {
  GRID_SIZE,
  ensureTreasureDay,
  treasureKnobs,
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
  const { extraDigCost } = await treasureKnobs();

  const result = await db.$transaction(async (tx) => {
    const row = await ensureTreasureDay(tx, day);
    if (row.foundById) {
      throw new HttpError(400, "Today's treasure has already been found. Come back tomorrow.");
    }

    const taken = await tx.treasureDig.findFirst({ where: { day, x, y } });
    if (taken) throw new HttpError(400, "Someone already dug that square today.");

    // First dig is free; every extra shovel today costs coins.
    const myDigs = await tx.treasureDig.count({ where: { day, userId: user.id } });
    if (myDigs >= 1) {
      await spendCoins(
        tx,
        user.id,
        extraDigCost,
        "treasure.extra_dig",
        "Bought an extra dig",
        `An extra dig costs ${extraDigCost} coins.`,
        { day }
      );
    }

    const found = x === row.x && y === row.y;
    await tx.treasureDig.create({
      data: { day, userId: user.id, x, y, found },
    });

    if (found) {
      await tx.treasureDay.update({
        where: { day },
        data: { foundById: user.id, foundAt: new Date() },
      });
      // The pot varies (rollover), so it's paid here rather than via a
      // fixed COIN_RULES entry — same ledger, same transaction.
      await creditWinnings(
        tx,
        user.id,
        row.pot,
        "treasure.found",
        "Found the buried treasure",
        { day, pot: row.pot }
      );
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
