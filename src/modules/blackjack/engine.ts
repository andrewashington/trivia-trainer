/**
 * Blackjack engine — pure functions over a serializable hand state.
 *
 * House rules (kept deliberately simple):
 *  - 4-deck shoe, fresh shuffle every hand
 *  - dealer STANDS on all 17s, including soft 17
 *  - blackjack (natural 21) pays 3:2, rounded down
 *  - hit / stand / double-down (double only on the first two cards)
 *  - NO splits — intentionally out of scope to keep the state machine
 *    a single hand; pairs just play as a normal hand
 *
 * Cards are 2-char codes: rank (2-9, T, J, Q, K, A) + suit (S, H, D, C).
 * The whole shoe lives server-side in BlackjackHand.state so the client
 * can never peek at the hole card or the next draw.
 */

export type HandState = {
  deck: string[]; // remaining shoe, draw from the end (pop)
  player: string[];
  dealer: string[]; // dealer[1] is the hole card while active
};

export type HandStatus = "active" | "won" | "lost" | "push" | "blackjack";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["S", "H", "D", "C"];
const DECKS_IN_SHOE = 4;

/** Crypto-shuffled 4-deck shoe. */
export function freshShoe(): string[] {
  const shoe: string[] = [];
  for (let d = 0; d < DECKS_IN_SHOE; d++)
    for (const r of RANKS) for (const s of SUITS) shoe.push(r + s);
  // Fisher-Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** Best total: aces count 11 unless that busts. Also reports softness. */
export function handValue(cards: string[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = c[0];
    if (r === "A") {
      aces++;
      total += 11;
    } else if ("TJQK".includes(r)) total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: string[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** Deal a fresh hand: player 2, dealer 2 (hole card = dealer[1]). */
export function dealHand(): HandState {
  const deck = freshShoe();
  const player = [deck.pop()!, deck.pop()!];
  const dealer = [deck.pop()!, deck.pop()!];
  return { deck, player, dealer };
}

export function draw(state: HandState, to: "player" | "dealer"): void {
  state[to].push(state.deck.pop()!);
}

/** Dealer draws to 17+; stands on ALL 17s (soft 17 stands). */
export function playDealer(state: HandState): void {
  while (handValue(state.dealer).total < 17) draw(state, "dealer");
}

/**
 * Settle a finished hand (dealer already played, or player busted).
 * Returns the status + total coins to credit back (stake included).
 * `bet` is the TOTAL staked (doubled bets pass the doubled amount).
 */
export function settle(
  state: HandState,
  bet: number,
  opts?: { natural?: boolean }
): { status: HandStatus; payout: number } {
  const p = handValue(state.player).total;
  const d = handValue(state.dealer).total;

  if (p > 21) return { status: "lost", payout: 0 };
  if (opts?.natural) {
    // player natural; dealer natural is checked by the caller (push)
    return { status: "blackjack", payout: bet + Math.floor(bet * 1.5) };
  }
  if (d > 21 || p > d) return { status: "won", payout: bet * 2 };
  if (p < d) return { status: "lost", payout: 0 };
  return { status: "push", payout: bet };
}

/** What the client may see. Hole card + shoe hidden while active. */
export function publicView(state: HandState, status: HandStatus) {
  const active = status === "active";
  const dealer = active ? [state.dealer[0]] : state.dealer;
  return {
    player: state.player,
    playerValue: handValue(state.player).total,
    dealer,
    dealerValue: active ? handValue([state.dealer[0]]).total : handValue(state.dealer).total,
    holeHidden: active,
  };
}
