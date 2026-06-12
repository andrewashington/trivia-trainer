import { randomBytes } from "crypto";

/**
 * Card encoding for Poker. A card is an int 0..51.
 *   rank = card % 13   (0 = Two, 1 = Three, … 8 = Ten, 9 = Jack, 10 = Queen,
 *                       11 = King, 12 = Ace)
 *   suit = (card / 13) | 0   (0 = Spades, 1 = Hearts, 2 = Diamonds, 3 = Clubs)
 *
 * Aces are HIGH (rank 12). The wheel (A-2-3-4-5) is handled in the evaluator,
 * not here.
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;
const SUIT_GLYPH = ["♠", "♥", "♦", "♣"] as const;

export function rankOf(card: number): number {
  return card % 13;
}
export function suitOf(card: number): number {
  return (card / 13) | 0;
}

/** Short label e.g. "A♠", "10♦". */
export function cardLabel(card: number): string {
  return RANKS[rankOf(card)] + SUIT_GLYPH[suitOf(card)];
}

/** Suit color hint for the UI: hearts/diamonds are red. */
export function isRedSuit(card: number): boolean {
  const s = suitOf(card);
  return s === 1 || s === 2;
}

/** A full ordered 52-card deck. */
export function fullDeck(): number[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** Crypto Fisher–Yates shuffle of a fresh deck. */
export function shuffledDeck(): number[] {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
