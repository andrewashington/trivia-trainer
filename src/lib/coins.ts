import type { Prisma } from "@prisma/client";
import type { OutboxEventType } from "@/lib/outbox";

/**
 * Coins ride the outbox: every domain event already names who did what,
 * so awards are declared here once instead of being sprinkled through
 * route handlers. New modules earn coins by adding a rule, nothing else.
 *
 * Social-gaming guardrails:
 *  - big, rare moments pay the most (group record > game win > posting)
 *  - repeatable actions have a per-day cap so grinding doesn't pay
 *  - everything lands in an append-only ledger (CoinTransaction) and the
 *    denormalized User.coins, updated in the same transaction as the event
 */

type Payload = Record<string, unknown>;

type CoinRule = {
  amount: number;
  /** Pull the earning user out of the event payload (field names vary). */
  userId: (p: Payload) => unknown;
  /** Max rewarded occurrences per user per UTC day (unset = unlimited). */
  dailyCap?: number;
  /** Human label for the ledger / future activity feed. */
  label: string;
};

export const COIN_RULES: Partial<Record<OutboxEventType, CoinRule>> = {
  // ---- Arcade: the headline earners ----
  "arcade.highscore": { amount: 50, userId: (p) => p.userId, label: "New group record" },
  "arcade.played": { amount: 5, userId: (p) => p.userId, dailyCap: 10, label: "Arcade run" },
  "arcade.tanks.finished": { amount: 40, userId: (p) => p.winnerId, label: "Won a tanks duel" },
  "challenge.won": { amount: 25, userId: (p) => p.winnerId, label: "Won a challenge" },
  // One-time by construction: the event only fires on first filing.
  "key.submitted": { amount: 500, userId: (p) => p.userId, label: "Filed the secret quiz" },

  // ---- Posting content ----
  "poll.created": { amount: 15, userId: (p) => p.createdBy, dailyCap: 5, label: "Posted a poll" },
  "recipe.created": { amount: 15, userId: (p) => p.authorId, dailyCap: 5, label: "Posted a recipe" },
  "idea.created": { amount: 15, userId: (p) => p.authorId, dailyCap: 5, label: "Posted an idea" },
  "reveal.created": { amount: 15, userId: (p) => p.createdBy, dailyCap: 5, label: "Posted a reveal" },
  "event.created": { amount: 15, userId: (p) => p.creatorId, dailyCap: 5, label: "Created an event" },
  "listing.created": { amount: 15, userId: (p) => p.sellerId, dailyCap: 5, label: "Posted a listing" },
  "claim.created": { amount: 10, userId: (p) => p.creatorId, dailyCap: 5, label: "Made a stake" },
  "challenge.created": { amount: 15, userId: (p) => p.creatorId, dailyCap: 5, label: "Threw down a challenge" },
  "challenge.entry.submitted": { amount: 10, userId: (p) => p.userId, dailyCap: 5, label: "Entered a challenge" },
  "wishlist.added": { amount: 10, userId: (p) => p.userId, dailyCap: 5, label: "Added a wish" },
  "map.pin.added": { amount: 10, userId: (p) => p.addedBy, dailyCap: 5, label: "Dropped a map pin" },
  "countdown.created": { amount: 10, userId: (p) => p.creatorId, dailyCap: 5, label: "Started a countdown" },
  "vault.created": { amount: 10, userId: (p) => p.createdBy, dailyCap: 5, label: "Saved a vault entry" },
  "file.uploaded": { amount: 10, userId: (p) => p.uploaderId, dailyCap: 5, label: "Uploaded a file" },

  // ---- Light engagement: small drips, tightly capped ----
  "poll.voted": { amount: 2, userId: (p) => p.voterId, dailyCap: 10, label: "Voted in a poll" },
  "reveal.submitted": { amount: 10, userId: (p) => p.userId, dailyCap: 5, label: "Answered a reveal" },
  "event.rsvp.changed": { amount: 2, userId: (p) => p.userId, dailyCap: 5, label: "RSVPed" },
  "pet.nudged": { amount: 2, userId: (p) => p.by, dailyCap: 5, label: "Fed the pet" },
  "comment.created": { amount: 2, userId: (p) => p.authorId, dailyCap: 10, label: "Left a comment" },
  "canvas.drew": { amount: 2, userId: (p) => p.userId, dailyCap: 5, label: "Doodled on the canvas" },
  "smash.deck.created": { amount: 15, userId: (p) => p.creatorId, dailyCap: 5, label: "Dealt a smash-or-pass deck" },
  "smash.voted": { amount: 1, userId: (p) => p.userId, dailyCap: 20, label: "Rendered a verdict" },
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

  if (rule.dailyCap !== undefined) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const today = await tx.coinTransaction.count({
      where: { userId, reason: type, createdAt: { gte: dayStart } },
    });
    if (today >= rule.dailyCap) return;
  }

  await tx.coinTransaction.create({
    data: { userId, amount: rule.amount, reason: type, meta: { label: rule.label } },
  });
  await tx.user.update({
    where: { id: userId },
    data: { coins: { increment: rule.amount } },
  });
}
