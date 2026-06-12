/**
 * Client-safe card rendering helpers (no crypto import, unlike cards.ts which
 * pulls in node:crypto for the shuffle). Same 0..51 encoding.
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_GLYPH = ["♠", "♥", "♦", "♣"];

export function rankLabel(card: number): string {
  return RANKS[card % 13];
}
export function suitGlyph(card: number): string {
  return SUIT_GLYPH[(card / 13) | 0];
}
export function cardLabel(card: number): string {
  return rankLabel(card) + suitGlyph(card);
}
/** Hearts (1) and diamonds (2) render red. */
export function isRed(card: number): boolean {
  const s = (card / 13) | 0;
  return s === 1 || s === 2;
}
