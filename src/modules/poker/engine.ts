import { evaluate7 } from "./evaluate";

/**
 * No-Limit Texas Hold'em betting engine.
 *
 * Pure-ish functions over a serializable `HandState` (stored in
 * PokerHand.state Json) plus the per-seat rows (PokerHandSeat). The engine
 * NEVER touches the database — the API routes load rows, call these
 * functions, and persist the mutations. This keeps the rules unit-testable
 * and the route a thin transactional shell.
 *
 * Chips conservation: every chip a player commits is tracked in their
 * HandSeat.committed/streetCommit. The pot is the sum of all committed
 * chips. At showdown those committed chips are distributed back into seat
 * stacks. No chips are minted or burned in play.
 */

export type Street = "preflop" | "flop" | "turn" | "river";
export type ActionKind = "fold" | "check" | "call" | "bet" | "raise";

/** One participating seat in a hand. Mirrors PokerHandSeat columns. */
export type SeatRow = {
  seatIndex: number;
  userId: string;
  startingStack: number;
  committed: number; // total chips put in this hand
  streetCommit: number; // chips in on the current street
  folded: boolean;
  allIn: boolean;
  // Current chips behind = startingStack - committed.
  hole: number[]; // SECRET — never sent to other players
};

/** The betting-machine state stored in PokerHand.state. */
export type HandState = {
  street: Street;
  currentBet: number; // highest streetCommit anyone must match
  minRaise: number; // size of the last full raise (min legal raise increment)
  toAct: number | null; // seatIndex whose turn it is, or null when hand over
  deadline: number | null; // epoch ms by which toAct must act
  lastAggressor: number | null; // seatIndex who made the last bet/raise
  // Seats who have acted since the last aggression (for closing the street).
  actedThisStreet: number[];
  smallBlind: number;
  bigBlind: number;
  clockHours: number;
  buttonSeat: number;
  result: HandResult | null; // set when status -> complete
};

export type PotAward = { seatIndex: number; userId: string; amount: number };
export type HandResult = {
  // Final showdown info for the UI.
  pots: { amount: number; winners: number[] }[]; // winners are seatIndexes
  awards: PotAward[]; // net chips credited to each seat stack
  reveal: { seatIndex: number; hole: number[]; category: number }[];
  board: number[];
  wonByFold: boolean;
};

function stackBehind(s: SeatRow): number {
  return s.startingStack - s.committed;
}

/** Seats still able to act (not folded, not all-in). */
function activeToAct(seats: SeatRow[]): SeatRow[] {
  return seats.filter((s) => !s.folded && !s.allIn);
}

/** Seats still in the hand (not folded). */
function inHand(seats: SeatRow[]): SeatRow[] {
  return seats.filter((s) => !s.folded);
}

/** Next occupied seat index after `from`, wrapping, among `pool` seatIndexes. */
function nextSeat(from: number, pool: number[]): number | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a - b);
  for (const idx of sorted) if (idx > from) return idx;
  return sorted[0];
}

function deadlineFrom(clockHours: number): number {
  return Date.now() + clockHours * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Start of hand: post blinds, deal holes, set first to act.
// ---------------------------------------------------------------------------

export type StartHandInput = {
  seats: SeatRow[]; // already created with committed=0, in seat order; holes dealt
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  clockHours: number;
};

/**
 * Posts blinds (mutating seat rows) and produces the opening HandState.
 * Heads-up: button posts the small blind and acts first preflop. 3+: SB is
 * left of button, BB next, action starts left of BB (UTG).
 *
 * Caller must have already dealt `hole` to each seat. Seats must be in
 * ascending seatIndex order is NOT required — we sort internally.
 */
export function startHand(input: StartHandInput): HandState {
  const { seats, buttonSeat, smallBlind, bigBlind, clockHours } = input;
  const order = seats.map((s) => s.seatIndex).sort((a, b) => a - b);
  const heads = order.length === 2;

  let sbSeat: number;
  let bbSeat: number;
  if (heads) {
    sbSeat = buttonSeat;
    bbSeat = nextSeat(buttonSeat, order)!;
  } else {
    sbSeat = nextSeat(buttonSeat, order)!;
    bbSeat = nextSeat(sbSeat, order)!;
  }

  const byIndex = (i: number) => seats.find((s) => s.seatIndex === i)!;
  postBlind(byIndex(sbSeat), smallBlind);
  postBlind(byIndex(bbSeat), bigBlind);

  // First to act preflop: heads-up it's the button/SB; otherwise left of BB.
  const firstToAct = heads ? sbSeat : nextSeat(bbSeat, order)!;

  const state: HandState = {
    street: "preflop",
    currentBet: bigBlind,
    minRaise: bigBlind, // a min-raise preflop is to 2×BB
    toAct: firstToAct,
    deadline: deadlineFrom(clockHours),
    lastAggressor: bbSeat, // BB is the "aggressor" preflop until raised
    actedThisStreet: [],
    smallBlind,
    bigBlind,
    clockHours,
    buttonSeat,
    result: null,
  };

  // If everyone except blinds is already all-in from posting (tiny stacks),
  // resolution is handled lazily by the route after applyAction; here we just
  // return the opening state.
  return state;
}

function postBlind(seat: SeatRow, blind: number) {
  const amount = Math.min(blind, stackBehind(seat));
  seat.committed += amount;
  seat.streetCommit += amount;
  if (stackBehind(seat) === 0) seat.allIn = true;
}

// ---------------------------------------------------------------------------
// Legality + applying an action.
// ---------------------------------------------------------------------------

export type LegalMoves = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number; // chips needed to call (capped at stack)
  canBet: boolean; // open the betting (no current bet)
  canRaise: boolean;
  minRaiseTo: number; // total streetCommit a raise must reach (legal minimum)
  maxRaiseTo: number; // all-in shove total streetCommit
};

/** What the seat to act may legally do right now. */
export function legalMoves(state: HandState, seats: SeatRow[]): LegalMoves | null {
  if (state.toAct === null) return null;
  const seat = seats.find((s) => s.seatIndex === state.toAct);
  if (!seat || seat.folded || seat.allIn) return null;

  const toCall = state.currentBet - seat.streetCommit;
  const behind = stackBehind(seat);
  const callAmount = Math.min(toCall, behind);

  // Raising: you must put the bet to at least currentBet + minRaise, unless
  // you're going all-in for less (a short all-in is always legal).
  const minRaiseTo = state.currentBet + state.minRaise;
  const maxRaiseTo = seat.streetCommit + behind; // shove

  const canCheck = toCall === 0;
  const canCall = toCall > 0 && behind > 0;
  const canBet = state.currentBet === 0 && behind > 0;
  // Can raise if there's a bet to raise and you have chips beyond the call.
  const canRaise = state.currentBet > 0 && behind > toCall && maxRaiseTo > state.currentBet;

  return {
    canFold: toCall > 0, // folding when you could check is allowed but pointless; we permit it
    canCheck,
    canCall,
    callAmount,
    canBet,
    canRaise,
    minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
    maxRaiseTo,
  };
}

export class IllegalAction extends Error {}

/**
 * Apply an action to the seat currently to act. Mutates the seat rows and
 * returns the new HandState (the same object, mutated). `amount` for
 * bet/raise is the TOTAL streetCommit to reach ("raise to"), matching the
 * sizer in the UI. Throws IllegalAction on anything illegal.
 *
 * After mutation, the caller should check `state.toAct === null` (street/hand
 * closed) and call advanceStreet / resolveShowdown as needed.
 */
export function applyAction(
  state: HandState,
  seats: SeatRow[],
  seatIndex: number,
  kind: ActionKind,
  amount?: number
): void {
  if (state.toAct !== seatIndex) throw new IllegalAction("Not your turn.");
  const seat = seats.find((s) => s.seatIndex === seatIndex);
  if (!seat || seat.folded || seat.allIn) throw new IllegalAction("You cannot act.");

  const moves = legalMoves(state, seats)!;
  const toCall = state.currentBet - seat.streetCommit;

  switch (kind) {
    case "fold": {
      seat.folded = true;
      break;
    }
    case "check": {
      if (!moves.canCheck) throw new IllegalAction("You can't check facing a bet.");
      break;
    }
    case "call": {
      if (toCall <= 0) throw new IllegalAction("Nothing to call.");
      const pay = Math.min(toCall, stackBehind(seat));
      seat.committed += pay;
      seat.streetCommit += pay;
      if (stackBehind(seat) === 0) seat.allIn = true;
      break;
    }
    case "bet":
    case "raise": {
      if (amount === undefined) throw new IllegalAction("Bet size required.");
      const target = amount; // total streetCommit to reach
      const behind = stackBehind(seat);
      const maxTarget = seat.streetCommit + behind;
      if (target > maxTarget) throw new IllegalAction("You don't have that many chips.");
      if (kind === "bet") {
        if (state.currentBet !== 0) throw new IllegalAction("There's already a bet; raise instead.");
        const minOpen = Math.min(state.bigBlind, maxTarget);
        if (target < minOpen) throw new IllegalAction("Bet is below the minimum.");
      } else {
        if (state.currentBet === 0) throw new IllegalAction("Nothing to raise; bet instead.");
        const minRaiseTo = state.currentBet + state.minRaise;
        const isAllIn = target === maxTarget;
        if (target <= state.currentBet) throw new IllegalAction("Raise must exceed the current bet.");
        if (target < minRaiseTo && !isAllIn) throw new IllegalAction("Raise is below the minimum.");
      }
      const add = target - seat.streetCommit;
      const raiseIncrement = target - state.currentBet;
      seat.committed += add;
      seat.streetCommit += add;
      // A full raise resets minRaise; a short all-in does not raise the bar
      // (so a subsequent player can't re-raise off an under-raise — standard).
      if (raiseIncrement >= state.minRaise || state.currentBet === 0) {
        state.minRaise = Math.max(state.minRaise, raiseIncrement);
      }
      state.currentBet = Math.max(state.currentBet, target);
      state.lastAggressor = seatIndex;
      state.actedThisStreet = []; // aggression reopens the action
      if (stackBehind(seat) === 0) seat.allIn = true;
      break;
    }
  }

  if (!state.actedThisStreet.includes(seatIndex)) state.actedThisStreet.push(seatIndex);

  advanceTurn(state, seats);
}

/**
 * Decide who acts next (or close the street/hand by setting toAct = null).
 * Sets a fresh deadline when a new player is on the clock.
 */
function advanceTurn(state: HandState, seats: SeatRow[]): void {
  // Only one player left in the hand -> hand over (everyone else folded).
  if (inHand(seats).length <= 1) {
    state.toAct = null;
    state.deadline = null;
    return;
  }

  const canAct = activeToAct(seats);
  // If nobody can still act (all remaining are all-in), the street is closed
  // and we run out the board to showdown.
  if (canAct.length === 0) {
    state.toAct = null;
    state.deadline = null;
    return;
  }

  // Walk from the current actor to the next seat who still needs to act.
  const pool = canAct.map((s) => s.seatIndex);
  let cursor = state.toAct!;
  for (let i = 0; i < seats.length + 1; i++) {
    const next = nextSeat(cursor, pool);
    if (next === null) break;
    cursor = next;
    const seat = seats.find((s) => s.seatIndex === next)!;
    const matched = seat.streetCommit === state.currentBet;
    const hasActed = state.actedThisStreet.includes(next);
    // A player still needs to act if they haven't acted since last aggression,
    // OR they haven't matched the current bet.
    if (!hasActed || !matched) {
      state.toAct = next;
      state.deadline = deadlineFrom(state.clockHours);
      return;
    }
    // If we've looped back to everyone matched + acted, street closes.
    if (next === state.lastAggressor || cursor === state.toAct) break;
  }

  // Street closed.
  state.toAct = null;
  state.deadline = null;
}

/**
 * Is the betting round over (toAct null) but the hand not yet at showdown?
 * Returns the street to deal next, or null if we should resolve showdown.
 */
export function needsStreetAdvance(state: HandState, seats: SeatRow[]): boolean {
  if (state.toAct !== null) return false;
  if (inHand(seats).length <= 1) return false; // win by fold
  if (state.street === "river") return false; // showdown
  return true;
}

/**
 * Advance to the next street. Caller deals the appropriate board cards and
 * passes them in; this resets street commitments and chooses first to act.
 */
export function advanceStreet(state: HandState, seats: SeatRow[]): void {
  const next: Record<Street, Street> = {
    preflop: "flop",
    flop: "turn",
    turn: "river",
    river: "river",
  };
  state.street = next[state.street];
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastAggressor = null;
  state.actedThisStreet = [];
  for (const s of seats) s.streetCommit = 0;

  const canAct = activeToAct(seats);
  if (canAct.length <= 1) {
    // Nobody to bet (all-in run-out, or only one with chips) — no action.
    state.toAct = null;
    state.deadline = null;
    return;
  }
  // Postflop first to act: first occupied seat left of the button.
  const pool = canAct.map((s) => s.seatIndex);
  state.toAct = nextSeat(state.buttonSeat, pool);
  state.deadline = state.toAct === null ? null : deadlineFrom(state.clockHours);
}

// ---------------------------------------------------------------------------
// Showdown + side pots.
// ---------------------------------------------------------------------------

/**
 * Build main + side pots from each seat's total `committed`, evaluate the
 * remaining (non-folded) hands against the 5-card board, and produce the
 * chip awards (added to each winner's seat stack). Folded players' committed
 * chips still feed the pots they could win against. Odd chips go to the seat
 * nearest the LEFT of the button (deterministic).
 *
 * `board` is the 5 community cards (run out fully before this is called).
 */
export function resolveShowdown(
  state: HandState,
  seats: SeatRow[],
  board: number[]
): HandResult {
  const contenders = inHand(seats);
  const wonByFold = contenders.length === 1;

  // Distinct positive commitment levels build the pot layers.
  const levels = Array.from(new Set(seats.map((s) => s.committed).filter((c) => c > 0))).sort(
    (a, b) => a - b
  );

  type Pot = { amount: number; eligible: number[] };
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const layer = level - prev;
    let amount = 0;
    const eligible: number[] = [];
    for (const s of seats) {
      if (s.committed >= level) {
        amount += layer;
        if (!s.folded) eligible.push(s.seatIndex);
      } else if (s.committed > prev) {
        // Partially funds this layer (their all-in short of `level`).
        amount += s.committed - prev;
      }
    }
    pots.push({ amount, eligible });
    prev = level;
  }

  // Evaluate each contender's best 7-card hand once.
  const scores = new Map<number, { score: number; category: number }>();
  for (const s of contenders) {
    scores.set(s.seatIndex, evaluate7([...s.hole, ...board]));
  }

  const awards: PotAward[] = [];
  const potSummaries: { amount: number; winners: number[] }[] = [];
  const seatOrder = seats.map((s) => s.seatIndex).sort((a, b) => a - b);

  const addAward = (seatIndex: number, amount: number) => {
    const seat = seats.find((s) => s.seatIndex === seatIndex)!;
    awards.push({ seatIndex, userId: seat.userId, amount });
  };

  for (const pot of pots) {
    if (pot.amount <= 0) continue;
    const live = pot.eligible.filter((i) => scores.has(i));
    if (live.length === 0) continue;
    // Best score among eligible.
    let best = -Infinity;
    for (const i of live) best = Math.max(best, scores.get(i)!.score);
    const winners = live.filter((i) => scores.get(i)!.score === best);
    potSummaries.push({ amount: pot.amount, winners });

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    // Award base share to each winner.
    for (const w of winners) addAward(w, share);
    // Odd chips: deterministic — left of the button, scanning seat order.
    const leftOfButton = orderFromButton(seatOrder, state.buttonSeat);
    for (const idx of leftOfButton) {
      if (remainder <= 0) break;
      if (winners.includes(idx)) {
        addAward(idx, 1);
        remainder--;
      }
    }
  }

  // Collapse multiple awards per seat.
  const merged = new Map<number, PotAward>();
  for (const a of awards) {
    const existing = merged.get(a.seatIndex);
    if (existing) existing.amount += a.amount;
    else merged.set(a.seatIndex, { ...a });
  }

  const reveal = wonByFold
    ? [] // no cards shown when everyone folds
    : contenders.map((s) => ({
        seatIndex: s.seatIndex,
        hole: s.hole,
        category: scores.get(s.seatIndex)!.category,
      }));

  return {
    pots: potSummaries,
    awards: [...merged.values()],
    reveal,
    board,
    wonByFold,
  };
}

/** Seat indexes ordered starting just left of the button (for odd chips). */
function orderFromButton(seatOrder: number[], button: number): number[] {
  const sorted = [...seatOrder].sort((a, b) => a - b);
  const after = sorted.filter((i) => i > button);
  const before = sorted.filter((i) => i <= button);
  return [...after, ...before];
}

// ---------------------------------------------------------------------------
// Lazy timeout: auto-act for a player whose clock expired.
// ---------------------------------------------------------------------------

/**
 * If the seat to act is past its deadline, auto-act: check if possible, else
 * fold. Mutates state/seats and returns true if an action was taken (so the
 * caller can loop — a chain of timed-out players, or advance the street).
 */
export function applyTimeoutIfDue(state: HandState, seats: SeatRow[], now = Date.now()): boolean {
  if (state.toAct === null || state.deadline === null) return false;
  if (now < state.deadline) return false;
  const seat = seats.find((s) => s.seatIndex === state.toAct);
  if (!seat) return false;
  const moves = legalMoves(state, seats);
  if (!moves) return false;
  if (moves.canCheck) {
    applyAction(state, seats, seat.seatIndex, "check");
  } else {
    applyAction(state, seats, seat.seatIndex, "fold");
  }
  return true;
}

/** Chips behind for a seat (exported for the route/view). */
export { stackBehind };

/** Number of seats still in the hand (not folded). */
export function inHandCount(seats: SeatRow[]): number {
  return inHand(seats).length;
}
