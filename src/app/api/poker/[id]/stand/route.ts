import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { HttpError, requireUser } from "@/lib/session";
import { creditWinnings } from "@/modules/arcade/bank";
import {
  advanceLiveHand,
  buildTableView,
  handStateFromDb,
  seatRowFromDb,
  saveSeatRows,
  runOut,
  settleHand,
  maybeDealHand,
} from "@/modules/poker/server";
import { applyAction, inHandCount } from "@/modules/poker/engine";

type Ctx = { params: { id: string } };

/**
 * POST — stand up and cash out the seat stack back to the coin balance
 * (zero-sum). If the player is in the current hand and hasn't folded, this
 * folds-and-leaves: they fold, the hand advances, and their remaining stack
 * (stack minus chips already committed this hand) returns to their balance.
 * Between hands, the whole stack returns.
 */
export const POST = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const tableId = params.id;

  // Resolve any due timeouts first so we act on current state.
  await advanceLiveHand(tableId);

  await db.$transaction(async (tx) => {
    const seat = await tx.pokerSeat.findUnique({
      where: { tableId_userId: { tableId, userId: user.id } },
    });
    if (!seat) throw new HttpError(400, "You're not seated here.");

    const table = await tx.pokerTable.findUnique({ where: { id: tableId } });
    if (!table) throw new HttpError(404, "Table not found.");

    const hand = await tx.pokerHand.findFirst({
      where: { tableId, status: "betting" },
      include: { seats: true },
    });

    const handSeat = hand?.seats.find((s) => s.userId === user.id && !s.folded);

    // If in the live hand, fold (and leave) — but only if it's legal to act
    // out of turn we just mark folded; if it's their turn use applyAction so
    // the hand advances cleanly. Either way they forfeit committed chips.
    if (hand && handSeat) {
      const state = handStateFromDb(hand);
      const seats = hand.seats.map(seatRowFromDb);
      const seatIds = new Map(hand.seats.map((s) => [s.seatIndex, s.id]));
      const deck = (hand.deck as unknown as number[]).slice();
      const board = (hand.board as unknown as number[]).slice();

      if (state.toAct === handSeat.seatIndex) {
        applyAction(state, seats, handSeat.seatIndex, "fold");
      } else {
        // Fold out of turn: mark folded, and if the table now has one player
        // left the hand ends.
        const row = seats.find((s) => s.seatIndex === handSeat.seatIndex)!;
        row.folded = true;
      }

      const result = runOut(state, seats, deck, board);
      await saveSeatRows(tx, hand.id, seats, seatIds);

      if (result) {
        await settleHand(tx, hand, state, seats, board, result, seatIds);
      } else {
        await tx.pokerHand.update({
          where: { id: hand.id },
          data: {
            state: state as unknown as Prisma.InputJsonValue,
            board: board as unknown as Prisma.InputJsonValue,
            deck: deck as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // Re-read this seat's stack — settleHand may have paid it out.
      const refreshed = await tx.pokerSeat.findUnique({
        where: { tableId_userId: { tableId, userId: user.id } },
      });
      const cashOut = refreshed?.stack ?? seat.stack;
      await creditWinnings(tx, user.id, cashOut, "poker.stand", `Left ${table.name}`, { tableId });
      await tx.pokerSeat.delete({ where: { id: seat.id } });
    } else {
      // Between hands (or already folded out this hand) — cash out full stack.
      await creditWinnings(tx, user.id, seat.stack, "poker.stand", `Left ${table.name}`, {
        tableId,
      });
      await tx.pokerSeat.delete({ where: { id: seat.id } });
    }

    // Try to start the next hand with whoever remains.
    await maybeDealHand(tx, tableId);
  });

  const table = await buildTableView(tableId, user.id);
  return NextResponse.json({ table });
});
