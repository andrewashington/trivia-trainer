import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/session";
import { HOUSE_EDGE, MIN_BET, MAX_BET, MAX_MULTIPLIER, MINES_TILES } from "./constants";
import { getGameKnobsCached } from "@/lib/knobs";

// Re-export the pure constants so existing server imports from "bank" keep
// working; client components import them from "./constants" directly to
// avoid bundling this module's `crypto` import.
export { HOUSE_EDGE, MIN_BET, MAX_BET, MAX_MULTIPLIER, MINES_TILES };

/**
 * Live, admin-tunable economy (Economy tab → "Arcade house"). Defaults to the
 * code constants and is refreshed from AppConfig in the background, debounced
 * to one read per TTL window — so the coin games stay off a per-play DB hit
 * while still honoring admin edits within ~15s. The constants above remain the
 * client-side contract (UI bet bounds); the server enforces these live values.
 */
const live = {
  houseEdge: HOUSE_EDGE,
  minBet: MIN_BET,
  maxBet: MAX_BET,
  maxMultiplier: MAX_MULTIPLIER,
};
let lastKick = 0;
function refreshEconomy() {
  const now = Date.now();
  if (now - lastKick < 15_000) return;
  lastKick = now;
  void getGameKnobsCached("arcade")
    .then((v) => {
      if (typeof v.houseEdge === "number") live.houseEdge = v.houseEdge;
      if (typeof v.minBet === "number") live.minBet = v.minBet;
      if (typeof v.maxBet === "number") live.maxBet = v.maxBet;
      if (typeof v.maxMultiplier === "number") live.maxMultiplier = v.maxMultiplier;
    })
    .catch(() => {});
}

/**
 * Shared economic engine for the Arcade coin games (Limbo / Mines / Crash).
 *
 * Every game is single-player vs. "the house". All randomness is generated
 * here, server-side — the client is never trusted. Money rides the same
 * CoinTransaction ledger + denormalized User.coins used everywhere else:
 * the stake is debited when a round starts and winnings are credited when
 * it's won, both inside the caller's DB transaction.
 *
 * Economics: a lost stake is simply burned (it leaves the player and is
 * never minted back), winnings are minted. With a positive HOUSE_EDGE the
 * expected value of every game is negative, so the total coin supply trends
 * down over time — this is the group's coin sink.
 */

/**
 * Cryptographically-strong uniform in (0, 1]. 48 random bits mapped so the
 * result is never exactly 0 (so 1/u never divides by zero) but can be 1.
 */
function uniform(): number {
  const n = randomBytes(6).readUIntBE(0, 6); // 0 .. 2^48 - 1
  return (n + 1) / 2 ** 48; // (0, 1]
}

/** Floor to 2 decimals and clamp to the mint cap. Never returns < 1.00. */
function clampMultiplier(x: number): number {
  const floored = Math.floor(x * 100) / 100;
  return Math.max(1, Math.min(live.maxMultiplier, floored));
}

/**
 * Limbo / generic crash-style roll: a result R with P(R ≥ x) = 1/x, i.e.
 * R = 1/u. The house edge is NOT in this distribution — Limbo applies the
 * edge to the payout multiplier instead (see the route).
 */
export function rollLimbo(): number {
  refreshEconomy();
  return clampMultiplier(1 / uniform());
}

/**
 * Crash point C with P(C ≥ x) = (1 − HOUSE_EDGE)/x. With probability
 * HOUSE_EDGE the round busts instantly at 1.00× (the edge); otherwise it
 * busts at (1 − edge)/u. The edge lives in the distribution here, so a
 * cash-out simply pays stake × multiplier_at_cashout with no further cut.
 */
export function rollCrashPoint(): number {
  refreshEconomy();
  const u = uniform();
  if (u >= 1 - live.houseEdge) return 1.0; // instant bust, probability = edge
  // Forgiveness floor: a non-instant round never crashes below 1.12×, so a
  // player watching always has a real window to react. (~9% of raw rolls
  // land in (1.00, 1.12) — those get bumped up; a small player-EV gift.)
  return Math.max(1.12, clampMultiplier((1 - live.houseEdge) / u));
}

/**
 * Mines multiplier after `safeRevealed` safe tiles with `mineCount` mines:
 * (1 − HOUSE_EDGE) / P(survived), where P(survived) is the chance of having
 * dodged every mine so far. At 0 reveals this is < 1, so callers must
 * require at least one reveal before allowing a cash-out.
 */
export function minesMultiplier(mineCount: number, safeRevealed: number): number {
  refreshEconomy();
  let pSurvive = 1;
  for (let i = 0; i < safeRevealed; i++) {
    pSurvive *= (MINES_TILES - mineCount - i) / (MINES_TILES - i);
  }
  return clampMultiplier((1 - live.houseEdge) / pSurvive);
}

/** Pick `count` distinct tile indices in [0, MINES_TILES) for the mines. */
export function placeMines(count: number): number[] {
  const pool = Array.from({ length: MINES_TILES }, (_, i) => i);
  // Fisher–Yates with crypto randomness, take the first `count`.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** Validate + coerce a bet. Throws HttpError(400) on anything out of range. */
export function validateBet(bet: unknown): number {
  refreshEconomy();
  if (typeof bet !== "number" || !Number.isInteger(bet)) {
    throw new HttpError(400, "Bet must be a whole number of coins.");
  }
  if (bet < live.minBet) throw new HttpError(400, `Minimum bet is ${live.minBet} coin.`);
  if (bet > live.maxBet)
    throw new HttpError(400, `Maximum bet is ${live.maxBet.toLocaleString()} coins.`);
  return bet;
}

/** Final payout for a winning round, with the cap applied. */
export function payout(stake: number, multiplier: number): number {
  refreshEconomy();
  return Math.floor(stake * Math.min(multiplier, live.maxMultiplier));
}

/**
 * Atomically spend coins. Uses a guarded conditional update
 * (`coins >= amount`) so two concurrent plays can never double-spend the
 * same balance — if the row no longer qualifies, count is 0 and we reject.
 * Call inside a db.$transaction.
 */
export async function spendCoins(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  reason: string,
  label: string,
  errorMessage = "Not enough coins.",
  meta: Record<string, unknown> = {}
): Promise<void> {
  if (amount <= 0) return;
  const res = await tx.user.updateMany({
    where: { id: userId, coins: { gte: amount } },
    data: { coins: { decrement: amount } },
  });
  if (res.count === 0) throw new HttpError(400, errorMessage);
  await tx.coinTransaction.create({
    data: { userId, amount: -amount, reason, meta: { label, ...meta } },
  });
}

/** Atomically debit a game stake. Call inside a db.$transaction. */
export async function debitStake(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  reason: string,
  label: string
): Promise<void> {
  await spendCoins(tx, userId, amount, reason, label, "Not enough coins for that bet.");
}

/** Atomically credit winnings (no-op for amount ≤ 0). Call inside a tx. */
export async function creditWinnings(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  reason: string,
  label: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  if (amount <= 0) return;
  await tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } });
  await tx.coinTransaction.create({
    data: { userId, amount, reason, meta: { label, ...meta } },
  });
}

/** Append a settled round to the audit/leaderboard log. Call inside a tx. */
export async function logRound(
  tx: Prisma.TransactionClient,
  round: { userId: string; game: string; stake: number; multiplier: number; outcome: "win" | "loss"; net: number }
): Promise<void> {
  await tx.arcadeRound.create({ data: round });
}
