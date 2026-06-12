import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { spendCoins } from "@/modules/arcade/bank";
import { sitInput } from "@/modules/poker/schema";
import { buildTableView, maybeDealHand } from "@/modules/poker/server";

type Ctx = { params: { id: string } };

const MAX_SEATS = 9;

/**
 * POST — buy into the table. Moves `buyIn` coins from the user's balance into
 * a new seat stack (zero-sum: nothing minted). Takes the lowest free seat
 * index. Auto-deals a hand if ≥2 eligible seats and no live hand.
 */
export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { buyIn } = await parseBody(req, sitInput);
  const tableId = params.id;

  await db.$transaction(async (tx) => {
    const table = await tx.pokerTable.findUnique({
      where: { id: tableId },
      include: { seats: true },
    });
    if (!table) throw new HttpError(404, "Table not found.");
    if (table.status !== "open") throw new HttpError(400, "This table is closed.");
    if (buyIn < table.bigBlind)
      throw new HttpError(400, `Buy-in must be at least the big blind (${table.bigBlind}).`);

    const already = table.seats.find((s) => s.userId === user.id);
    if (already) throw new HttpError(400, "You're already seated here.");
    if (table.seats.length >= MAX_SEATS) throw new HttpError(400, "Table is full.");

    // Lowest free seat index.
    const taken = new Set(table.seats.map((s) => s.seatIndex));
    let seatIndex = 0;
    while (taken.has(seatIndex)) seatIndex++;

    // Debit balance -> seat stack (guarded against overdraw).
    await spendCoins(
      tx,
      user.id,
      buyIn,
      "poker.sit",
      `Sat down at ${table.name}`,
      "Not enough coins to buy in.",
      { tableId }
    );

    await tx.pokerSeat.create({
      data: { tableId, userId: user.id, seatIndex, stack: buyIn },
    });

    await maybeDealHand(tx, tableId);
  });

  const table = await buildTableView(tableId, user.id);
  return NextResponse.json({ table });
});
