import { randomBytes } from "crypto";

/**
 * Slots engine — classic 3-reel, single payline, single-player vs. the house.
 *
 * Each of the 3 reels is an INDEPENDENT weighted draw from the same symbol
 * strip (server-side crypto RNG). The line pays on three-of-a-kind; the rarer
 * the symbol the fatter the multiplier. There's also a small consolation for
 * exactly two cherries on the line. Crown triple is the jackpot.
 *
 * The expected return is computed exactly by enumeration in `expectedReturn()`
 * and tuned to land at (1 - HOUSE_EDGE) ≈ 0.99. See the self-check at the
 * bottom of this file (run with `npx tsx src/modules/slots/engine.ts`).
 *
 * MEASURED expected return with the weights/paytable below: 0.9903
 * (i.e. ~0.97% effective house edge — inside the 0.96–1.00 target band,
 * tuned right against HOUSE_EDGE = 0.01).
 */

export type SlotSymbol = {
  /** Stable index used on the wire (the reel result is [i,i,i]). */
  id: number;
  /** Emoji glyph rendered on the reel. */
  glyph: string;
  /** Short name for tooltips / history. */
  name: string;
  /** Relative draw weight on the strip. Higher = more common. */
  weight: number;
  /** Payout multiplier for three of this symbol on the line. */
  triple: number;
};

/**
 * The symbol strip. Order = id. Weights are relative (we normalize by their
 * sum). Multipliers climb with rarity; 👑 crown triple is the jackpot.
 */
export const SYMBOLS: SlotSymbol[] = [
  { id: 0, glyph: "🍒", name: "cherry", weight: 30, triple: 5 },
  { id: 1, glyph: "🔔", name: "bell", weight: 22, triple: 12 },
  { id: 2, glyph: "🎲", name: "dice", weight: 16, triple: 23 },
  { id: 3, glyph: "💰", name: "moneybag", weight: 11, triple: 42 },
  { id: 4, glyph: "💣", name: "bomb", weight: 8, triple: 80 },
  { id: 5, glyph: "7️⃣", name: "seven", weight: 5, triple: 170 },
  { id: 6, glyph: "👑", name: "crown", weight: 2, triple: 225 },
];

/** Cherry is the only symbol that pays for a partial (two on the line). */
export const CHERRY_ID = 0;
export const TWO_CHERRY_PAY = 2;

/** Crown triple — the jackpot symbol. */
export const CROWN_ID = 6;

const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0);

/** Crypto-strong integer in [0, max). */
function randInt(max: number): number {
  // 32 bits of entropy, rejection-free modulo bias is negligible for our sizes
  // but we use a clean rejection loop to be exact.
  const limit = Math.floor(0xffffffff / max) * max;
  let n: number;
  do {
    n = randomBytes(4).readUInt32BE(0);
  } while (n >= limit);
  return n % max;
}

/** Draw one symbol id from the weighted strip. */
function drawReel(): number {
  let r = randInt(TOTAL_WEIGHT);
  for (const s of SYMBOLS) {
    if (r < s.weight) return s.id;
    r -= s.weight;
  }
  return SYMBOLS[SYMBOLS.length - 1].id; // unreachable
}

export type SpinResult = {
  reels: [number, number, number];
  /** Payout multiplier on the line (0 = loss). */
  multiplier: number;
  /** True iff three crowns. */
  jackpot: boolean;
};

/** Score a fixed reel triple → multiplier + jackpot flag. Pure; reused by EV. */
export function scoreLine(reels: [number, number, number]): { multiplier: number; jackpot: boolean } {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    const sym = SYMBOLS[a];
    return { multiplier: sym.triple, jackpot: a === CROWN_ID };
  }
  // Consolation: exactly two cherries anywhere on the line.
  const cherries = reels.filter((x) => x === CHERRY_ID).length;
  if (cherries === 2) return { multiplier: TWO_CHERRY_PAY, jackpot: false };
  return { multiplier: 0, jackpot: false };
}

/** Spin all three reels independently and score the line. */
export function spin(): SpinResult {
  const reels: [number, number, number] = [drawReel(), drawReel(), drawReel()];
  const { multiplier, jackpot } = scoreLine(reels);
  return { reels, multiplier, jackpot };
}

/**
 * Exact expected return per unit stake, computed by enumerating all
 * 7^3 = 343 reel combinations weighted by their probabilities. Returns the
 * fraction of stake a player gets back on average (≈ 1 - house_edge).
 */
export function expectedReturn(): number {
  const probs = SYMBOLS.map((s) => s.weight / TOTAL_WEIGHT);
  let ev = 0;
  for (let a = 0; a < SYMBOLS.length; a++) {
    for (let b = 0; b < SYMBOLS.length; b++) {
      for (let c = 0; c < SYMBOLS.length; c++) {
        const p = probs[a] * probs[b] * probs[c];
        const { multiplier } = scoreLine([a, b, c]);
        ev += p * multiplier;
      }
    }
  }
  return ev;
}

// --- Self-check: `npx tsx src/modules/slots/engine.ts` -----------------------
// Prints the exact EV and the per-symbol triple probabilities. Guarded so it
// only runs when executed directly, never on import.
if (typeof require !== "undefined" && require.main === module) {
  const ev = expectedReturn();
  // eslint-disable-next-line no-console
  console.log(`Slots expected return = ${ev.toFixed(4)} (house edge = ${((1 - ev) * 100).toFixed(2)}%)`);
  for (const s of SYMBOLS) {
    const p = s.weight / TOTAL_WEIGHT;
    // eslint-disable-next-line no-console
    console.log(`  ${s.glyph} ${s.name.padEnd(9)} p=${p.toFixed(4)}  P(triple)=${(p ** 3).toExponential(2)}  pays ${s.triple}x`);
  }
}
