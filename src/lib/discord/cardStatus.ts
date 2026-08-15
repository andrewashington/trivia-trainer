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

/** The live tally line on a Book market card — Yes/No split + coins riding. */
export const bookStatus = (yes: number, no: number, totalStake: number) =>
  `🟢 ${yes} Yes · 🔴 ${no} No · 💰 ${totalStake.toLocaleString()} coins on the line`;

/** The live line on a program card — who's running it, sessions banked. */
export const pumpStatus = (running: number, sessions: number) =>
  `💪 ${running} running · ${sessions} session${sessions === 1 ? "" : "s"} logged`;

const num = (p: Record<string, unknown> | undefined, key: string) =>
  typeof p?.[key] === "number" ? (p[key] as number) : 0;

/** The initial status line for a freshly-posted, trackable card. */
export function initialStatusFor(
  type: OutboxEventType,
  payload?: Record<string, unknown>
): string | undefined {
  switch (type) {
    case "event.created":
      return rsvpStatus(0, 0, 0);
    case "fitness.plan.created":
      return pumpStatus(0, 0);
    case "listing.created":
      return availableStatus();
    case "poll.created":
      return pollStatus(0);
    case "book.bet.placed":
      return bookStatus(num(payload, "yesCount"), num(payload, "noCount"), num(payload, "totalStake"));
    default:
      return undefined;
  }
}
