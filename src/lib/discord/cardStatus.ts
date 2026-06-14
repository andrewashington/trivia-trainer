import type { OutboxEventType } from "@/lib/outbox";

/**
 * Status-line copy for live-editable cards. The drainer seeds the initial line
 * when it posts the card; the interaction handlers rebuild it on each change
 * (RSVP counts, CLAIMED, vote tallies). Single source of truth for the format,
 * so the seeded line and the updated line always match.
 */

export const rsvpStatus = (going: number, maybe: number, no: number) =>
  `✅ ${going} going · 🤔 ${maybe} maybe · 🙅 ${no} out`;

export const claimedStatus = (name: string) => `🏷️ Claimed by ${name}`;

export const availableStatus = () => "🟢 Up for grabs — first tap wins";

export const pollStatus = (total: number) =>
  total === 0 ? "📊 No votes yet — tap Vote" : `📊 ${total} vote${total === 1 ? "" : "s"} in`;

/** The initial status line for a freshly-posted, trackable card. */
export function initialStatusFor(type: OutboxEventType): string | undefined {
  switch (type) {
    case "event.created":
      return rsvpStatus(0, 0, 0);
    case "listing.created":
      return availableStatus();
    case "poll.created":
      return pollStatus(0);
    default:
      return undefined;
  }
}
