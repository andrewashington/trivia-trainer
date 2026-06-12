import type { Prisma } from "@prisma/client";
import type { OutboxEventType } from "@/lib/outbox";

/**
 * Coins ride the outbox: every domain event already names who did what,
 * so awards are declared here once instead of being sprinkled through
 * route handlers. New modules earn coins by adding a rule, nothing else.
 *
 * Social-gaming guardrails:
 *  - big, rare moments pay the most (group record > game win > posting)
 *  - everything lands in an append-only ledger (CoinTransaction) and the
 *    denormalized User.coins, updated in the same transaction as the event
 */

type Payload = Record<string, unknown>;

type CoinRule = {
  amount: number;
  /** Pull the earning user out of the event payload (field names vary). */
  userId: (p: Payload) => unknown;
  /** Human label for the ledger / future activity feed. */
  label: string;
};

export const COIN_RULES: Partial<Record<OutboxEventType, CoinRule>> = {
  // ---- Arcade: the headline earners ----
  "arcade.highscore": { amount: 500, userId: (p) => p.userId, label: "New group record" },
  "arcade.played": { amount: 50, userId: (p) => p.userId, label: "Arcade run" },
  "arcade.tanks.finished": { amount: 400, userId: (p) => p.winnerId, label: "Won a tanks duel" },
  "challenge.won": { amount: 300, userId: (p) => p.winnerId, label: "Won a challenge" },
  // One-time by construction: the event only fires on first filing.
  "key.submitted": { amount: 5000, userId: (p) => p.userId, label: "Filed the secret quiz" },

  // ---- Posting content ----
  "poll.created": { amount: 150, userId: (p) => p.createdBy, label: "Posted a poll" },
  "recipe.created": { amount: 150, userId: (p) => p.authorId, label: "Posted a recipe" },
  "idea.created": { amount: 150, userId: (p) => p.authorId, label: "Posted an idea" },
  "reveal.created": { amount: 150, userId: (p) => p.createdBy, label: "Posted a reveal" },
  "event.created": { amount: 150, userId: (p) => p.creatorId, label: "Created an event" },
  "listing.created": { amount: 150, userId: (p) => p.sellerId, label: "Posted a listing" },
  "claim.created": { amount: 100, userId: (p) => p.creatorId, label: "Made a stake" },
  "challenge.created": { amount: 150, userId: (p) => p.creatorId, label: "Threw down a challenge" },
  "challenge.entry.submitted": { amount: 100, userId: (p) => p.userId, label: "Entered a challenge" },
  "wishlist.added": { amount: 100, userId: (p) => p.userId, label: "Added a wish" },
  "map.pin.added": { amount: 100, userId: (p) => p.addedBy, label: "Dropped a map pin" },
  "countdown.created": { amount: 100, userId: (p) => p.creatorId, label: "Started a countdown" },
  "vault.created": { amount: 100, userId: (p) => p.createdBy, label: "Saved a vault entry" },
  "file.uploaded": { amount: 100, userId: (p) => p.uploaderId, label: "Uploaded a file" },

  // ---- Light engagement: small drips ----
  "poll.voted": { amount: 25, userId: (p) => p.voterId, label: "Voted in a poll" },
  "reveal.submitted": { amount: 100, userId: (p) => p.userId, label: "Answered a reveal" },
  "event.rsvp.changed": { amount: 25, userId: (p) => p.userId, label: "RSVPed" },
  "pet.nudged": { amount: 25, userId: (p) => p.by, label: "Fed the pet" },
  "comment.created": { amount: 25, userId: (p) => p.authorId, label: "Left a comment" },
  "canvas.drew": { amount: 25, userId: (p) => p.userId, label: "Doodled on the canvas" },
  "smash.deck.created": { amount: 150, userId: (p) => p.creatorId, label: "Dealt a smash-or-pass deck" },
  "smash.voted": { amount: 15, userId: (p) => p.userId, label: "Rendered a verdict" },

  // ---- 20 Questions ----
  // Poker is zero-sum (coins only move between seat stacks) so it earns no
  // house award here — the pot is funded entirely by players.
  "twentyq.created": { amount: 150, userId: (p) => p.hostId, label: "Hosted 20 Questions" },
  "twentyq.solved": { amount: 300, userId: (p) => p.winnerId, label: "Cracked 20 Questions" },
  // treasure.found pays the (variable) pot directly in its route — no fixed rule here.
};

/**
 * Apply the coin rule (if any) for an outbox event, inside the same
 * transaction. Never throws — a coin hiccup must not roll back the
 * underlying mutation's transaction logic, so bad payloads just skip.
 */
export async function applyCoinRule(
  tx: Prisma.TransactionClient,
  type: OutboxEventType,
  payload: Prisma.InputJsonValue
): Promise<void> {
  const rule = COIN_RULES[type];
  if (!rule) return;
  const p = (payload ?? {}) as Payload;
  const userId = rule.userId(p);
  if (typeof userId !== "string" || !userId) return; // e.g. anonymous poll votes

  await tx.coinTransaction.create({
    data: { userId, amount: rule.amount, reason: type, meta: { label: rule.label } },
  });
  await tx.user.update({
    where: { id: userId },
    data: { coins: { increment: rule.amount } },
  });
}
