import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser, HttpError } from "@/lib/session";
import { createTableInput } from "@/modules/poker/schema";

const userSelect = { select: { id: true, displayName: true, avatarUrl: true } };

/** GET — list open tables with seat counts + blinds. */
export const GET = apiHandler(async () => {
  await requireUser();
  const tables = await db.pokerTable.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    include: {
      seats: { include: { user: userSelect } },
      hands: { where: { status: "betting" }, select: { id: true } },
    },
  });

  const list = tables.map((t) => ({
    id: t.id,
    name: t.name,
    smallBlind: t.smallBlind,
    bigBlind: t.bigBlind,
    clockHours: t.clockHours,
    seatCount: t.seats.length,
    handLive: t.hands.length > 0,
    players: t.seats.map((s) => ({
      userId: s.userId,
      displayName: s.user.displayName,
      avatarUrl: s.user.avatarUrl,
      stack: s.stack,
    })),
  }));

  return NextResponse.json({ tables: list });
});

/** POST — create a table. */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, createTableInput);

  const smallBlind = input.smallBlind ?? 1;
  const bigBlind = input.bigBlind ?? Math.max(smallBlind * 2, 2);
  if (bigBlind <= smallBlind) throw new HttpError(400, "Big blind must exceed the small blind.");

  const table = await withOutbox(
    (tx) =>
      tx.pokerTable.create({
        data: {
          name: input.name,
          smallBlind,
          bigBlind,
          clockHours: input.clockHours,
          createdById: user.id,
        },
      }),
    (t) => ({
      type: "poker.table.created",
      payload: {
        tableId: t.id,
        name: t.name,
        smallBlind: t.smallBlind,
        bigBlind: t.bigBlind,
        clockHours: t.clockHours,
        createdById: user.id,
      },
    })
  );

  return NextResponse.json({ id: table.id }, { status: 201 });
});
