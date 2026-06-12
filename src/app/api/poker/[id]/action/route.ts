import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { actionInput } from "@/modules/poker/schema";
import {
  advanceLiveHand,
  buildTableView,
  handStateFromDb,
  seatRowFromDb,
  saveSeatRows,
  runOut,
  settleHand,
  maybeDealHand,
  notifyToAct,
} from "@/modules/poker/server";
import { applyAction, IllegalAction } from "@/modules/poker/engine";

type Ctx = { params: { id: string } };

/**
 * POST — take a betting action (fold/check/call/bet/raise). Verifies it's the
 * caller's turn, applies the move via the engine inside a transaction
 * (re-reading state in the tx to guard against double-acting), advances the
 * street / resolves showdown, pays pots into seat stacks on completion, and
 * auto-deals the next hand if ≥2 players remain.
 */
export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { kind, amount } = await parseBody(req, actionInput);
  const tableId = params.id;

  // Resolve any due timeouts first (someone before us may have timed out).
  await advanceLiveHand(tableId);

  await db.$transaction(async (tx) => {
    const hand = await tx.pokerHand.findFirst({
      where: { tableId, status: "betting" },
      include: { seats: true },
    });
    if (!hand) throw new HttpError(400, "No hand in progress.");

    const table = await tx.pokerTable.findUnique({ where: { id: tableId } });
    if (!table) throw new HttpError(404, "Table not found.");

    const state = handStateFromDb(hand);
    const seats = hand.seats.map(seatRowFromDb);
    const seatIds = new Map(hand.seats.map((s) => [s.seatIndex, s.id]));
    const mySeat = hand.seats.find((s) => s.userId === user.id);
    if (!mySeat) throw new HttpError(403, "You're not in this hand.");

    // Double-act guard: re-checked inside the tx.
    if (state.toAct !== mySeat.seatIndex) throw new HttpError(400, "It's not your turn.");

    try {
      applyAction(state, seats, mySeat.seatIndex, kind, amount);
    } catch (e) {
      if (e instanceof IllegalAction) throw new HttpError(400, e.message);
      throw e;
    }

    const deck = (hand.deck as unknown as number[]).slice();
    const board = (hand.board as unknown as number[]).slice();

    const result = runOut(state, seats, deck, board);
    await saveSeatRows(tx, hand.id, seats, seatIds);

    if (result) {
      await settleHand(tx, hand, state, seats, board, result, seatIds);
      // Deal the next hand if enough players remain.
      await maybeDealHand(tx, tableId);
    } else {
      await tx.pokerHand.update({
        where: { id: hand.id },
        data: {
          state: state as unknown as Prisma.InputJsonValue,
          board: board as unknown as Prisma.InputJsonValue,
          deck: deck as unknown as Prisma.InputJsonValue,
        },
      });
      // Notify whoever is now on the clock (if it changed to someone new).
      if (state.toAct !== null && state.toAct !== mySeat.seatIndex) {
        await notifyToAct(tx, tableId, state, seats, table.name);
      }
    }
  });

  const table = await buildTableView(tableId, user.id);
  return NextResponse.json({ table });
});
