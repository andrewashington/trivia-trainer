import { db } from "@/lib/db";
import type { OutboxEventType } from "@/lib/outbox";
import { type CardExtras, formatWhen, formatPrice } from "@/lib/discord/feed";

/**
 * Builds the rich body the PNG renders for a card (poll options, event
 * when/where, listing price, …). The outbox payload only carries ids + a
 * headline, so the heavier content is fetched from the entity here. Returns {}
 * for types with no extra body — the card then renders headline + actor only.
 */
export async function cardExtras(
  type: OutboxEventType,
  payload: Record<string, unknown>
): Promise<CardExtras> {
  const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : undefined);
  const num = (k: string) => (typeof payload[k] === "number" ? (payload[k] as number) : undefined);

  switch (type) {
    case "poll.created": {
      const id = str("pollId");
      if (!id) return {};
      const poll = await db.poll.findUnique({
        where: { id },
        select: { type: true, options: { orderBy: { order: "asc" }, select: { label: true } } },
      });
      if (!poll) return {};
      if (poll.type === "scale") return { badge: "SCALE", facts: [{ label: "RATE", value: "1 to 5" }] };
      return {
        badge: poll.type === "multi" ? "PICK ANY" : "PICK ONE",
        options: poll.options.map((o) => o.label),
      };
    }
    case "event.created": {
      const id = str("eventId");
      const ev = id
        ? await db.event.findUnique({ where: { id }, select: { startAt: true, location: true } })
        : null;
      const facts: { label: string; value: string }[] = [];
      const when = formatWhen(ev?.startAt ?? str("startAt"));
      if (when) facts.push({ label: "WHEN", value: when });
      if (ev?.location) facts.push({ label: "WHERE", value: ev.location });
      return { facts };
    }
    case "listing.created": {
      const cents = num("priceCents");
      const id = str("listingId");
      const listing = id
        ? await db.listing.findUnique({ where: { id }, select: { delivery: true } })
        : null;
      const facts: { label: string; value: string }[] = [];
      if (listing?.delivery) facts.push({ label: "PICKUP", value: deliveryLabel(listing.delivery) });
      return { badge: cents != null ? formatPrice(cents) : "FREE?", facts };
    }
    case "idea.created": {
      const id = str("ideaId");
      const idea = id
        ? await db.idea.findUnique({ where: { id }, select: { detail: true } })
        : null;
      return idea?.detail ? { facts: [{ label: "DETAIL", value: idea.detail }] } : {};
    }
    case "countdown.created": {
      const when = formatWhen(str("targetAt"));
      return when ? { facts: [{ label: "LANDS", value: when }] } : {};
    }
    case "book.bet.placed": {
      const id = str("marketId");
      if (!id) return {};
      const { bookAvatars } = await import("@/modules/book/discordCard");
      return { avatars: await bookAvatars(id) };
    }
    default:
      return {};
  }
}

function deliveryLabel(d: string): string {
  if (d === "pickup") return "Pickup only";
  if (d === "delivery") return "Delivery";
  return "Pickup or delivery";
}
