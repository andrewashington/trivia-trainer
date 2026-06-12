import type { Prisma, PokerHand, PokerHandSeat, PokerSeat } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";
import { withOutbox } from "@/lib/outbox";
import { shuffledDeck } from "./cards";
import {
  type HandState,
  type SeatRow,
  type HandResult,
  applyTimeoutIfDue,
  needsStreetAdvance,
  advanceStreet,
  resolveShowdown,
  inHandCount,
  legalMoves,
  stackBehind,
} from "./engine";

// ---------------------------------------------------------------------------
// Helpers to bridge DB rows <-> engine types.
// ---------------------------------------------------------------------------

export function seatRowFromDb(s: PokerHandSeat): SeatRow {
  return {
    seatIndex: s.seatIndex,
    userId: s.userId,
    startingStack: s.startingStack,
    committed: s.committed,
    streetCommit: s.streetCommit,
    folded: s.folded,
    allIn: s.allIn,
    hole: (s.hole as unknown as number[]) ?? [],
  };
}

export function handStateFromDb(h: PokerHand): HandState {
  return h.state as unknown as HandState;
}

// ---------------------------------------------------------------------------
// Persist engine mutations back to the DB (inside a tx).
// ---------------------------------------------------------------------------

export async function saveSeatRows(
  tx: Prisma.TransactionClient,
  handId: string,
  seats: SeatRow[],
  seatIds: Map<number, string>
): Promise<void> {
  for (const s of seats) {
    const id = seatIds.get(s.seatIndex)!;
    await tx.pokerHandSeat.update({
      where: { id },
      data: {
        committed: s.committed,
        streetCommit: s.streetCommit,
        folded: s.folded,
        allIn: s.allIn,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Deal the next board cards for a freshly-advanced street.
// ---------------------------------------------------------------------------

/** How many board cards the given (post-advance) street needs in total. */
function boardSizeForStreet(street: HandState["street"]): number {
  return street === "preflop" ? 0 : street === "flop" ? 3 : street === "turn" ? 4 : 5;
}

/**
 * Run the betting machine forward from a closed street: deal streets and, if
 * everyone's all-in, run out the rest of the board, until either a player is
 * back on the clock or we reach showdown. Mutates `state`, `seats`, `deck`,
 * `board`. Returns the showdown result if the hand completed, else null.
 */
export function runOut(
  state: HandState,
  seats: SeatRow[],
  deck: number[],
  board: number[]
): HandResult | null {
  // Win by fold short-circuit.
  if (inHandCount(seats) <= 1) {
    return resolveShowdown(state, seats, board);
  }

  // Keep advancing streets while the betting is closed and not at showdown.
  while (state.toAct === null) {
    if (!needsStreetAdvance(state, seats)) {
      // River closed (or only all-ins remain at river) -> showdown.
      // Ensure board is fully dealt before evaluating.
      while (board.length < 5) board.push(deck.pop()!);
      return resolveShowdown(state, seats, board);
    }
    advanceStreet(state, seats);
    const need = boardSizeForStreet(state.street);
    while (board.length < need) board.push(deck.pop()!);
    // If advanceStreet left someone on the clock, betting resumes — stop.
    if (state.toAct !== null) return null;
    // Otherwise (everyone all-in) loop to deal the next street.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lazy timeout advancement — run on every GET / before every action.
// ---------------------------------------------------------------------------

type FullHand = PokerHand & { seats: PokerHandSeat[] };

/**
 * Load the live hand for a table (status "betting"), apply any due timeouts,
 * and persist. Returns the (possibly-updated) hand, or null if no live hand.
 *
 * This is the single place async auto-acting happens: whenever anyone loads
 * the table, a player whose clock expired is auto-checked/folded and the hand
 * advances (possibly through several streets / a showdown).
 */
export async function advanceLiveHand(tableId: string): Promise<FullHand | null> {
  const hand = await db.pokerHand.findFirst({
    where: { tableId, status: "betting" },
    include: { seats: true },
  });
  if (!hand) return null;

  const state = handStateFromDb(hand);
  // Fast path: nothing due.
  if (state.toAct !== null && state.deadline !== null && Date.now() < state.deadline) {
    return hand;
  }
  if (state.toAct === null) return hand; // mid-resolution shouldn't persist here

  // A timeout is due — apply it (and any cascading ones) in a transaction.
  return db.$transaction(async (tx) => {
    // Re-read inside the tx to avoid racing a concurrent action.
    const fresh = await tx.pokerHand.findFirst({
      where: { tableId, status: "betting", id: hand.id },
      include: { seats: true },
    });
    if (!fresh) return hand;
    const st = handStateFromDb(fresh);
    if (st.toAct === null || st.deadline === null || Date.now() < st.deadline) return fresh;

    const seats = fresh.seats.map(seatRowFromDb);
    const seatIds = new Map(fresh.seats.map((s) => [s.seatIndex, s.id]));
    const deck = (fresh.deck as unknown as number[]).slice();
    const board = (fresh.board as unknown as number[]).slice();

    // Apply timeouts until someone is on the clock or the street/hand closes.
    let acted = false;
    while (applyTimeoutIfDue(st, seats)) acted = true;
    if (!acted) return fresh;

    const result = runOut(st, seats, deck, board);

    await saveSeatRows(tx, fresh.id, seats, seatIds);

    if (result) {
      await settleHand(tx, fresh, st, seats, board, result, seatIds);
      const updated = await tx.pokerHand.findUnique({
        where: { id: fresh.id },
        include: { seats: true },
      });
      return updated!;
    }

    await tx.pokerHand.update({
      where: { id: fresh.id },
      data: {
        state: st as unknown as Prisma.InputJsonValue,
        board: board as unknown as Prisma.InputJsonValue,
        deck: deck as unknown as Prisma.InputJsonValue,
      },
    });
    const updated = await tx.pokerHand.findUnique({
      where: { id: fresh.id },
      include: { seats: true },
    });
    return updated!;
  });
}

/**
 * Pay a completed hand's awards into the table seat stacks, mark the hand
 * complete, emit the outbox event, and notify the winner(s). MUST run inside
 * the caller's transaction. Does NOT auto-deal the next hand (the route does).
 */
export async function settleHand(
  tx: Prisma.TransactionClient,
  hand: PokerHand,
  state: HandState,
  seats: SeatRow[],
  board: number[],
  result: HandResult,
  _seatIds: Map<number, string>
): Promise<void> {
  state.result = result;

  // Move chips from committed pot back into table seat stacks. Each seat's
  // net = its awards. Their committed chips already left their stack at sit
  // time conceptually; here we reconcile the table PokerSeat.stack to:
  //   newStack = (startingStack - committed) + awarded
  const table = await tx.pokerTable.findUnique({ where: { id: hand.tableId } });
  for (const s of seats) {
    const award = result.awards.find((a) => a.seatIndex === s.seatIndex)?.amount ?? 0;
    const finalStack = s.startingStack - s.committed + award;
    await tx.pokerSeat.updateMany({
      where: { tableId: hand.tableId, seatIndex: s.seatIndex, userId: s.userId },
      data: { stack: finalStack },
    });
  }

  await tx.pokerHand.update({
    where: { id: hand.id },
    data: {
      status: "complete",
      completedAt: new Date(),
      state: state as unknown as Prisma.InputJsonValue,
      board: board as unknown as Prisma.InputJsonValue,
      pot: result.pots.reduce((sum, p) => sum + p.amount, 0),
    },
  });

  // Notify winners (those with a positive award) that they took a pot.
  for (const award of result.awards) {
    if (award.amount <= 0) continue;
    await tx.notification.create({
      data: {
        userId: award.userId,
        type: "poker.win",
        targetType: "poker",
        targetId: hand.tableId,
        title: `You won ${award.amount.toLocaleString()} chips at ${table?.name ?? "the table"}`,
        href: `/poker/${hand.tableId}`,
      },
    });
  }

  const { emitOutbox } = await import("@/lib/outbox");
  await emitOutbox(tx, "poker.hand.finished", {
    tableId: hand.tableId,
    handId: hand.id,
    handNumber: hand.handNumber,
    pot: result.pots.reduce((sum, p) => sum + p.amount, 0),
    winners: result.awards.filter((a) => a.amount > 0).map((a) => a.userId),
    wonByFold: result.wonByFold,
  });
}

// ---------------------------------------------------------------------------
// Notify the player who is now on the clock (called after dealing/advancing).
// ---------------------------------------------------------------------------

export async function notifyToAct(
  tx: Prisma.TransactionClient,
  tableId: string,
  state: HandState,
  seats: SeatRow[],
  tableName: string
): Promise<void> {
  if (state.toAct === null) return;
  const seat = seats.find((s) => s.seatIndex === state.toAct);
  if (!seat) return;
  await tx.notification.create({
    data: {
      userId: seat.userId,
      type: "poker.turn",
      targetType: "poker",
      targetId: tableId,
      title: `It's your turn at ${tableName}`,
      href: `/poker/${tableId}`,
    },
  });
}

// ---------------------------------------------------------------------------
// View builders — STRIP secrets (deck, others' holes).
// ---------------------------------------------------------------------------

const userSelect = { select: { id: true, displayName: true, avatarUrl: true } };

export type TableSeatView = {
  seatIndex: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  stack: number;
  sittingOut: boolean;
};

export type HandSeatView = {
  seatIndex: number;
  userId: string;
  committed: number;
  streetCommit: number;
  folded: boolean;
  allIn: boolean;
  stackBehind: number;
  // Hole cards: only the requesting player's, OR revealed at showdown.
  hole: number[] | null;
  showdownCategory: number | null;
};

export type HandView = {
  id: string;
  handNumber: number;
  buttonSeat: number;
  street: HandState["street"];
  board: number[];
  pot: number;
  currentBet: number;
  minRaise: number;
  toAct: number | null;
  deadline: number | null;
  status: "betting" | "complete";
  seats: HandSeatView[];
  result: HandResult | null;
  // Legal moves for the requesting user, if it's their turn.
  myMoves: ReturnType<typeof legalMoves> | null;
  mySeatIndex: number | null;
};

export type TableView = {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  clockHours: number;
  status: string;
  seats: TableSeatView[];
  hand: HandView | null;
  meId: string;
};

export async function buildTableView(tableId: string, meId: string): Promise<TableView> {
  // Lazy-advance any due timeouts first so the view is current.
  await advanceLiveHand(tableId);

  const table = await db.pokerTable.findUnique({
    where: { id: tableId },
    include: {
      seats: { include: { user: userSelect }, orderBy: { seatIndex: "asc" } },
    },
  });
  if (!table) throw new HttpError(404, "Table not found.");

  const liveHand = await db.pokerHand.findFirst({
    where: { tableId },
    orderBy: { handNumber: "desc" },
    include: { seats: { orderBy: { seatIndex: "asc" } } },
  });

  const seats: TableSeatView[] = table.seats.map((s) => ({
    seatIndex: s.seatIndex,
    userId: s.userId,
    displayName: s.user.displayName,
    avatarUrl: s.user.avatarUrl,
    stack: s.stack,
    sittingOut: s.sittingOut,
  }));

  let handView: HandView | null = null;
  if (liveHand) {
    const state = handStateFromDb(liveHand);
    const seatRows = liveHand.seats.map(seatRowFromDb);
    const isComplete = liveHand.status === "complete";
    const mySeat = liveHand.seats.find((s) => s.userId === meId);

    const handSeats: HandSeatView[] = liveHand.seats.map((s) => {
      const row = seatRowFromDb(s);
      const isMe = s.userId === meId;
      // Reveal at showdown: non-folded seats when the hand completed AND it
      // wasn't won by fold.
      const revealed =
        isComplete && state.result && !state.result.wonByFold && !s.folded;
      const showdownCategory =
        isComplete && state.result
          ? state.result.reveal.find((r) => r.seatIndex === s.seatIndex)?.category ?? null
          : null;
      return {
        seatIndex: s.seatIndex,
        userId: s.userId,
        committed: s.committed,
        streetCommit: s.streetCommit,
        folded: s.folded,
        allIn: s.allIn,
        stackBehind: stackBehind(row),
        hole: isMe || revealed ? (s.hole as unknown as number[]) : null,
        showdownCategory,
      };
    });

    const pot = seatRows.reduce((sum, s) => sum + s.committed, 0);
    const myMoves =
      !isComplete && mySeat && state.toAct === mySeat.seatIndex
        ? legalMoves(state, seatRows)
        : null;

    handView = {
      id: liveHand.id,
      handNumber: liveHand.handNumber,
      buttonSeat: liveHand.buttonSeat,
      street: state.street,
      board: liveHand.board as unknown as number[],
      pot: isComplete ? liveHand.pot : pot,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      toAct: isComplete ? null : state.toAct,
      deadline: isComplete ? null : state.deadline,
      status: liveHand.status as "betting" | "complete",
      seats: handSeats,
      result: isComplete ? state.result : null,
      myMoves,
      mySeatIndex: mySeat?.seatIndex ?? null,
    };
  }

  return {
    id: table.id,
    name: table.name,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    clockHours: table.clockHours,
    status: table.status,
    seats,
    hand: handView,
    meId,
  };
}

// ---------------------------------------------------------------------------
// Deal a fresh hand at a table (used by sit + after a hand completes).
// ---------------------------------------------------------------------------

/**
 * Start a new hand if ≥2 active (not sitting out, stack ≥ bigBlind) seats and
 * no live "betting" hand exists. Returns true if a hand was dealt. Runs in
 * the caller's tx. Picks the button as the next seat clockwise from the last
 * hand's button (or the lowest seat for the first hand).
 */
export async function maybeDealHand(
  tx: Prisma.TransactionClient,
  tableId: string
): Promise<boolean> {
  const existing = await tx.pokerHand.findFirst({
    where: { tableId, status: "betting" },
    select: { id: true },
  });
  if (existing) return false;

  const table = await tx.pokerTable.findUnique({
    where: { id: tableId },
    include: { seats: { orderBy: { seatIndex: "asc" } } },
  });
  if (!table) return false;

  // Eligible = has at least the big blind and not sitting out.
  const eligible = table.seats.filter((s) => !s.sittingOut && s.stack >= table.bigBlind);
  if (eligible.length < 2) return false;

  const last = await tx.pokerHand.findFirst({
    where: { tableId },
    orderBy: { handNumber: "desc" },
    select: { handNumber: true, buttonSeat: true },
  });
  const handNumber = (last?.handNumber ?? 0) + 1;

  const seatIdxs = eligible.map((s) => s.seatIndex).sort((a, b) => a - b);
  // Next button clockwise from the previous one (or lowest seat first hand).
  let buttonSeat: number;
  if (last) {
    buttonSeat =
      seatIdxs.find((i) => i > last.buttonSeat) ?? seatIdxs[0];
  } else {
    buttonSeat = seatIdxs[0];
  }

  // Deal.
  const deck = shuffledDeck();
  const holes = new Map<number, number[]>();
  for (const idx of seatIdxs) holes.set(idx, [deck.pop()!, deck.pop()!]);

  const hand = await tx.pokerHand.create({
    data: {
      tableId,
      handNumber,
      buttonSeat,
      deck: deck as unknown as Prisma.InputJsonValue,
      board: [] as unknown as Prisma.InputJsonValue,
      pot: 0,
      state: {} as unknown as Prisma.InputJsonValue,
      status: "betting",
    },
  });

  const seatRows: SeatRow[] = [];
  const seatIds = new Map<number, string>();
  for (const e of eligible) {
    const created = await tx.pokerHandSeat.create({
      data: {
        handId: hand.id,
        seatIndex: e.seatIndex,
        userId: e.userId,
        hole: holes.get(e.seatIndex) as unknown as Prisma.InputJsonValue,
        startingStack: e.stack,
        committed: 0,
        streetCommit: 0,
      },
    });
    seatIds.set(e.seatIndex, created.id);
    seatRows.push({
      seatIndex: e.seatIndex,
      userId: e.userId,
      startingStack: e.stack,
      committed: 0,
      streetCommit: 0,
      folded: false,
      allIn: false,
      hole: holes.get(e.seatIndex)!,
    });
  }

  const { startHand } = await import("./engine");
  const state = startHand({
    seats: seatRows,
    buttonSeat,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    clockHours: table.clockHours,
  });

  // Persist blinds (startHand mutated seatRows) + opening state.
  await saveSeatRows(tx, hand.id, seatRows, seatIds);
  await tx.pokerHand.update({
    where: { id: hand.id },
    data: { state: state as unknown as Prisma.InputJsonValue },
  });

  await notifyToAct(tx, tableId, state, seatRows, table.name);

  return true;
}
