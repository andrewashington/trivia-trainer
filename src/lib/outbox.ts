import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type OutboxEventType =
  | "recipe.created"
  | "recipe.updated"
  | "recipe.deleted"
  | "event.created"
  | "event.updated"
  | "event.deleted"
  | "event.rsvp.changed"
  | "nowplaying.updated"
  | "file.uploaded"
  | "file.deleted"
  | "member.added"
  | "member.removed"
  | "vault.created"
  | "vault.updated"
  | "vault.deleted"
  | "contact.updated"
  | "wishlist.added"
  | "wishlist.removed"
  | "map.pin.added"
  | "map.pin.removed"
  | "idea.created"
  | "idea.updated"
  | "idea.deleted"
  | "idea.vote.changed"
  | "listing.created"
  | "listing.claimed"
  | "listing.unclaimed"
  | "listing.updated"
  | "listing.deleted"
  | "poll.created"
  | "poll.voted"
  | "poll.closed"
  | "poll.results.revealed"
  | "poll.deleted"
  | "reveal.created"
  | "reveal.submitted"
  | "reveal.revealed"
  | "reveal.deleted"
  | "claim.created"
  | "claim.resolved"
  | "claim.settled"
  | "claim.deleted"
  | "pet.nudged"
  | "pet.renamed"
  | "arcade.played"
  | "arcade.highscore"
  | "arcade.tanks.challenged"
  | "arcade.tanks.finished"
  | "countdown.created"
  | "countdown.deleted"
  | "feedback.created"
  | "howgay.checked"
  | "photobook.photo.added"
  | "photobook.photo.deleted"
  | "arcade.blackjack.won"
  | "challenge.created"
  | "challenge.entry.submitted"
  | "challenge.won"
  | "tierlist.created"
  | "tierlist.ranked"
  | "tierlist.deleted"
  | "key.submitted"
  | "comment.created"
  | "comment.deleted"
  | "treasure.dug"
  | "treasure.found"
  | "canvas.drew"
  | "smash.deck.created"
  | "smash.voted"
  | "smash.deck.deleted";

/**
 * Write a domain event (and apply any coin award it earns) on an open
 * transaction. Use this instead of `tx.outboxEvent.create` directly so
 * events and coins can never diverge.
 */
export async function emitOutbox(
  tx: Prisma.TransactionClient,
  type: OutboxEventType,
  payload: Prisma.InputJsonValue
): Promise<void> {
  await tx.outboxEvent.create({ data: { type, payload } });
  const { applyCoinRule } = await import("@/lib/coins"); // lazy: avoids a module cycle
  await applyCoinRule(tx, type, payload);
}

/**
 * Run `fn` and write a domain event in the SAME database transaction, so
 * the outbox can never disagree with the data. Nothing consumes the
 * outbox in v1; the phase-2 Discord worker drains it.
 */
export async function withOutbox<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  event: (result: T) => { type: OutboxEventType; payload: Prisma.InputJsonValue }
): Promise<T> {
  return db.$transaction(async (tx) => {
    const result = await fn(tx);
    const { type, payload } = event(result);
    await emitOutbox(tx, type, payload);
    return result;
  });
}
