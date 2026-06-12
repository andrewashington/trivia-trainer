import { rankOf, suitOf } from "./cards";

/**
 * 7-card best-5 hand evaluator for Texas Hold'em.
 *
 * Returns a comparable numeric score plus a human category. Higher score =
 * better hand. Two hands tie iff their scores are equal.
 *
 * The score packs the hand CATEGORY in the high digits and up to five
 * tiebreak ranks (kickers) in base-16 below it, so a plain numeric compare
 * resolves everything including kickers. Ranks here are 0..12 (Two..Ace),
 * matching cards.ts.
 *
 * Categories (higher is better):
 *   8 straight flush   7 four of a kind   6 full house   5 flush
 *   4 straight         3 three of a kind  2 two pair      1 one pair
 *   0 high card
 */

export const CATEGORY_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

export type HandScore = {
  score: number;
  category: number; // 0..8 index into CATEGORY_NAMES
};

/** Pack a category + ordered tiebreak ranks into one comparable number. */
function pack(category: number, tiebreaks: number[]): number {
  // 6 slots of 4 bits each (rank 0..12 fits in 4 bits); category on top.
  let n = category;
  for (let i = 0; i < 5; i++) {
    n = n * 16 + (tiebreaks[i] ?? 0);
  }
  return n;
}

/**
 * Best straight high-rank from a set of distinct ranks, or -1 if none.
 * Handles the wheel (A-2-3-4-5) where the Ace plays low and the straight's
 * high card is the Five (rank 3).
 */
function straightHigh(rankSet: Set<number>): number {
  // Normal straights: look for 5 consecutive ranks, highest first.
  for (let high = 12; high >= 4; high--) {
    let ok = true;
    for (let r = high; r > high - 5; r--) {
      if (!rankSet.has(r)) {
        ok = false;
        break;
      }
    }
    if (ok) return high;
  }
  // Wheel: A(12),2(0),3(1),4(2),5(3) -> high card is the Five (rank 3).
  if (rankSet.has(12) && rankSet.has(0) && rankSet.has(1) && rankSet.has(2) && rankSet.has(3)) {
    return 3;
  }
  return -1;
}

/**
 * Evaluate the best 5-card hand out of up to 7 cards (ints 0..51).
 */
export function evaluate7(cards: number[]): HandScore {
  const ranks = cards.map(rankOf);
  const suits = cards.map(suitOf);

  // Count ranks and suits.
  const rankCount = new Array(13).fill(0);
  for (const r of ranks) rankCount[r]++;
  const suitCards: number[][] = [[], [], [], []];
  cards.forEach((c, i) => suitCards[suits[i]].push(ranks[i]));

  // ---- Flush / straight-flush detection ----
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCards[s].length >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const flushRanks = new Set(suitCards[flushSuit]);
    const sfHigh = straightHigh(flushRanks);
    if (sfHigh >= 0) {
      return { score: pack(8, [sfHigh]), category: 8 };
    }
  }

  // ---- Four of a kind ----
  const four = rankCount.findIndex((c) => c === 4);
  if (four >= 0) {
    const kicker = highestExcept(ranks, [four], 1)[0];
    return { score: pack(7, [four, kicker]), category: 7 };
  }

  // ---- Full house (and trips/pairs collection) ----
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rankCount[r] === 3) trips.push(r);
    else if (rankCount[r] === 2) pairs.push(r);
  }
  if (trips.length >= 1 && (pairs.length >= 1 || trips.length >= 2)) {
    const tripRank = trips[0];
    // Best pair: a second set of trips can serve as the pair.
    const pairRank = pairs.length >= 1 ? pairs[0] : trips[1];
    return { score: pack(6, [tripRank, pairRank]), category: 6 };
  }

  // ---- Flush (plain) ----
  if (flushSuit >= 0) {
    const top5 = [...suitCards[flushSuit]].sort((a, b) => b - a).slice(0, 5);
    return { score: pack(5, top5), category: 5 };
  }

  // ---- Straight ----
  const sHigh = straightHigh(new Set(ranks));
  if (sHigh >= 0) {
    return { score: pack(4, [sHigh]), category: 4 };
  }

  // ---- Three of a kind ----
  if (trips.length >= 1) {
    const t = trips[0];
    const kickers = highestExcept(ranks, [t], 2);
    return { score: pack(3, [t, ...kickers]), category: 3 };
  }

  // ---- Two pair ----
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    const kicker = highestExcept(ranks, [p1, p2], 1)[0];
    return { score: pack(2, [p1, p2, kicker]), category: 2 };
  }

  // ---- One pair ----
  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers = highestExcept(ranks, [p], 3);
    return { score: pack(1, [p, ...kickers]), category: 1 };
  }

  // ---- High card ----
  const top5 = [...ranks].sort((a, b) => b - a).slice(0, 5);
  return { score: pack(0, top5), category: 0 };
}

/** Highest `count` ranks not in `exclude`, descending. */
function highestExcept(ranks: number[], exclude: number[], count: number): number[] {
  const ex = new Set(exclude);
  return [...ranks]
    .filter((r) => !ex.has(r))
    .sort((a, b) => b - a)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Inline self-test. Run with: npx tsx src/modules/poker/evaluate.ts
// ---------------------------------------------------------------------------

/** Build a card int from rank (0..12) and suit (0..3). */
function mk(rank: number, suit: number): number {
  return suit * 13 + rank;
}
// rank shorthands
const T2 = 0, T3 = 1, T4 = 2, T5 = 3, T6 = 4, T7 = 5, T8 = 6, T9 = 7, TT = 8, TJ = 9, TQ = 10, TK = 11, TA = 12;
const S = 0, H = 1, D = 2, C = 3;

export function selfTest(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  const checks: [string, boolean][] = [];

  const ev = (cs: number[]) => evaluate7(cs).score;
  const cat = (cs: number[]) => evaluate7(cs).category;

  const royal = [mk(TA, S), mk(TK, S), mk(TQ, S), mk(TJ, S), mk(TT, S), mk(T2, H), mk(T3, D)];
  const quads = [mk(TA, S), mk(TA, H), mk(TA, D), mk(TA, C), mk(TK, S), mk(T2, H), mk(T3, D)];
  const boat = [mk(TA, S), mk(TA, H), mk(TA, D), mk(TK, C), mk(TK, S), mk(T2, H), mk(T3, D)];
  const flush = [mk(TA, S), mk(TJ, S), mk(T9, S), mk(T6, S), mk(T3, S), mk(TK, H), mk(TQ, D)];
  const straight = [mk(T9, S), mk(T8, H), mk(T7, D), mk(T6, C), mk(T5, S), mk(TA, H), mk(TK, D)];
  const wheel = [mk(TA, S), mk(T2, H), mk(T3, D), mk(T4, C), mk(T5, S), mk(TK, H), mk(TQ, D)];
  const trips = [mk(TA, S), mk(TA, H), mk(TA, D), mk(TK, C), mk(TQ, S), mk(T2, H), mk(T3, D)];
  const twoPair = [mk(TA, S), mk(TA, H), mk(TK, D), mk(TK, C), mk(TQ, S), mk(T2, H), mk(T3, D)];
  const pair = [mk(TA, S), mk(TA, H), mk(TK, D), mk(TQ, C), mk(TJ, S), mk(T2, H), mk(T3, D)];
  const high = [mk(TA, S), mk(TK, H), mk(TQ, D), mk(TJ, C), mk(T9, S), mk(T2, H), mk(T3, D)];

  checks.push(["royal flush is straight flush category", cat(royal) === 8]);
  checks.push(["quads category", cat(quads) === 7]);
  checks.push(["full house category", cat(boat) === 6]);
  checks.push(["flush category", cat(flush) === 5]);
  checks.push(["straight category", cat(straight) === 4]);
  checks.push(["wheel is a straight", cat(wheel) === 4]);
  checks.push(["trips category", cat(trips) === 3]);
  checks.push(["two pair category", cat(twoPair) === 2]);
  checks.push(["one pair category", cat(pair) === 1]);
  checks.push(["high card category", cat(high) === 0]);

  // Ordering chain
  checks.push(["royal > quads", ev(royal) > ev(quads)]);
  checks.push(["quads > boat", ev(quads) > ev(boat)]);
  checks.push(["boat > flush", ev(boat) > ev(flush)]);
  checks.push(["flush > straight", ev(flush) > ev(straight)]);
  checks.push(["straight > trips", ev(straight) > ev(trips)]);
  checks.push(["trips > two pair", ev(trips) > ev(twoPair)]);
  checks.push(["two pair > pair", ev(twoPair) > ev(pair)]);
  checks.push(["pair > high", ev(pair) > ev(high)]);

  // Wheel high card is the Five, so a 9-high straight beats it.
  checks.push(["9-high straight > wheel", ev(straight) > ev(wheel)]);

  // Kicker resolution: AAxKQ vs AAxKJ -> first wins on Q>J kicker.
  const pairAKQ = [mk(TA, S), mk(TA, H), mk(TK, D), mk(TQ, C), mk(T8, S), mk(T2, H), mk(T3, D)];
  const pairAKJ = [mk(TA, S), mk(TA, H), mk(TK, D), mk(TJ, C), mk(T8, S), mk(T2, H), mk(T3, D)];
  checks.push(["pair kicker Q beats J", ev(pairAKQ) > ev(pairAKJ)]);

  // Flush tiebreak: A-high flush beats K-high flush.
  const flushK = [mk(TK, S), mk(TJ, S), mk(T9, S), mk(T6, S), mk(T3, S), mk(TA, H), mk(TQ, D)];
  checks.push(["A-high flush > K-high flush", ev(flush) > ev(flushK)]);

  // Two pair higher pair wins: AAKK vs QQJJ
  const tpHigh = [mk(TA, S), mk(TA, H), mk(TK, D), mk(TK, C), mk(T5, S), mk(T2, H), mk(T3, D)];
  const tpLow = [mk(TQ, S), mk(TQ, H), mk(TJ, D), mk(TJ, C), mk(T5, S), mk(T2, H), mk(T3, D)];
  checks.push(["two pair AAKK > QQJJ", ev(tpHigh) > ev(tpLow)]);

  // Identical hands tie.
  const a = [mk(TA, S), mk(TA, H), mk(TK, D), mk(TQ, C), mk(TJ, S), mk(T2, H), mk(T3, D)];
  const b = [mk(TA, D), mk(TA, C), mk(TK, S), mk(TQ, H), mk(TJ, D), mk(T2, S), mk(T3, C)];
  checks.push(["identical pairs tie", ev(a) === ev(b)]);

  // Full house picks best trips+pair: AAAKKQQ -> AAA + KK (not QQ)
  const fhPick = [mk(TA, S), mk(TA, H), mk(TA, D), mk(TK, C), mk(TK, S), mk(TQ, H), mk(TQ, D)];
  const fhRef = [mk(TA, S), mk(TA, H), mk(TA, D), mk(TK, C), mk(TK, S), mk(T2, H), mk(T3, D)];
  checks.push(["full house picks best pair", ev(fhPick) === ev(fhRef)]);

  for (const [name, ok] of checks) {
    if (ok) passed++;
    else {
      failed++;
      console.error("FAIL:", name);
    }
  }
  return { passed, failed };
}

// Run directly via tsx/node.
if (typeof require !== "undefined" && require.main === module) {
  const { passed, failed } = selfTest();
  console.log(`evaluate self-test: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
