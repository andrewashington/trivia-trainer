/**
 * Pure arcade constants — the client/server contract for the coin games.
 * Kept free of any Node-only imports (no `crypto`) so client components can
 * import these without pulling the server-side bank engine into the bundle.
 * `bank.ts` re-exports these, so server code can keep importing from either.
 */

/** House cut baked into every payout. 4% — squarely in the 3–5% target. */
export const HOUSE_EDGE = 0.04;

/** Bet bounds, in coins. Caps how much one tap can burn or mint. */
export const MIN_BET = 1;
export const MAX_BET = 10_000;

/** No single round can mint more than MAX_MULTIPLIER × stake. */
export const MAX_MULTIPLIER = 1000;

/** Mines is a fixed 5×5 board. */
export const MINES_TILES = 25;
