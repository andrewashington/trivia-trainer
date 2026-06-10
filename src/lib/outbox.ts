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
  | "feedback.created";

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
    await tx.outboxEvent.create({ data: { type, payload } });
    return result;
  });
}
