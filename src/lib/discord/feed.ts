import type { OutboxEventType } from "@/lib/outbox";
import type { IconName } from "@/components/icons";
import { feedContribution } from "@/lib/discord/registry";

/**
 * Phase-1 Discord feed: which outbox events get announced, and how.
 * Anything not in this map is drained silently (marked processed,
 * never posted) so the channel stays highlights-only.
 */

export type CardSpec = {
  /** Module registry key — picks accent color + icon. */
  module: ModuleKey;
  /** Short uppercase verb chip, e.g. "NEW RECIPE". */
  kicker: string;
  headline: string;
  /** Secondary mono line; "{actor}" is replaced with a display name. */
  sub: string;
  /** Whose display name fills {actor}. */
  actorId?: string;
  /** App path the embed links to. */
  path: string;
};

export type ModuleKey =
  | "cookbook"
  | "events"
  | "nowplaying"
  | "files"
  | "wishlist"
  | "contacts"
  | "vault"
  | "map"
  | "ideas"
  | "marketplace"
  | "polls"
  | "reveal"
  | "stakes"
  | "pet"
  | "snake"
  | "countdowns"
  | "home";

/** Accent hexes mirror tailwind.config.ts — Satori can't read Tailwind. */
export const moduleStyle: Record<
  ModuleKey,
  { accent: string; accentText: string; icon: IconName; label: string }
> = {
  cookbook: { accent: "#FF4D2E", accentText: "#FFFFFF", icon: "book-open", label: "Cookbook" },
  events: { accent: "#2563FF", accentText: "#FFFFFF", icon: "calendar", label: "Events" },
  nowplaying: { accent: "#FFD60A", accentText: "#101010", icon: "tv", label: "Now Playing" },
  files: { accent: "#3DDC4E", accentText: "#101010", icon: "folder", label: "Files" },
  wishlist: { accent: "#FF9F1C", accentText: "#101010", icon: "gift", label: "Wishlist" },
  contacts: { accent: "#FF6FB5", accentText: "#101010", icon: "contact", label: "People" },
  vault: { accent: "#00CFE8", accentText: "#101010", icon: "lock", label: "Vault" },
  map: { accent: "#16C2A3", accentText: "#101010", icon: "map-pin", label: "Map" },
  ideas: { accent: "#B5E631", accentText: "#101010", icon: "lightbulb", label: "Ideas" },
  marketplace: { accent: "#E0218A", accentText: "#FFFFFF", icon: "store", label: "Market" },
  polls: { accent: "#6A5CFF", accentText: "#FFFFFF", icon: "chart-bar-big", label: "Polls" },
  reveal: { accent: "#101010", accentText: "#FFFFFF", icon: "eye", label: "Reveal" },
  stakes: { accent: "#0B9E63", accentText: "#FFFFFF", icon: "target", label: "Stakes" },
  pet: { accent: "#38BDF8", accentText: "#101010", icon: "downasaur", label: "Pet" },
  snake: { accent: "#9B5DE5", accentText: "#FFFFFF", icon: "apple", label: "Snake" },
  countdowns: { accent: "#FF3366", accentText: "#FFFFFF", icon: "clock", label: "Countdowns" },
  home: { accent: "#FFD60A", accentText: "#101010", icon: "home", label: "UDM+" },
};

type Payload = Record<string, unknown>;

// --- Phase 2: interactive components on bot-posted cards ---
// Discord component wire format: action row (type 1) wrapping buttons
// (type 2; style 1 primary / 2 secondary / 3 success / 4 danger).
// custom_id encodes "action:...:entityId" and is re-validated against
// the DB on click (src/lib/discord/interactions.ts) — never trusted.

const row = (...components: object[]) => ({ type: 1, components });
const btn = (style: number, label: string, custom_id: string) => ({
  type: 2,
  style,
  label,
  custom_id,
});

/**
 * Buttons for a card, or null for a plain card. Only meaningful when
 * posting as the bot — webhook messages can't carry components.
 */
export function componentsFor(type: OutboxEventType, payload: Payload): object[] | null {
  // Feature-contributed buttons win; core cards fall through to the switch.
  const contrib = feedContribution(type)?.components?.(payload);
  if (contrib) return contrib;
  switch (type) {
    case "event.created": {
      const id = str(payload, "eventId");
      if (!id) return null;
      return [
        row(
          btn(3, "Going", `rsvp:going:${id}`),
          btn(2, "Maybe", `rsvp:maybe:${id}`),
          btn(4, "Out", `rsvp:no:${id}`)
        ),
      ];
    }
    case "poll.created": {
      const id = str(payload, "pollId");
      if (!id) return null;
      return [row(btn(1, "Vote", `poll:vote:${id}`))];
    }
    case "listing.created": {
      const id = str(payload, "listingId");
      if (!id) return null;
      return [row(btn(3, "Claim it", `claim:${id}`))];
    }
    case "idea.created": {
      const id = str(payload, "ideaId");
      if (!id) return null;
      return [row(btn(1, "▲ Upvote", `idea:up:${id}`))];
    }
    default:
      return null;
  }
}

const str = (p: Payload, key: string) =>
  typeof p[key] === "string" ? (p[key] as string) : undefined;
const num = (p: Payload, key: string) =>
  typeof p[key] === "number" ? (p[key] as number) : undefined;

function formatWhen(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.FEED_TZ || "America/New_York",
  });
}

function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return "free?";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * Map an outbox row to a card, or null to drain it silently. Copy is
 * written for a friend-group channel: short, lowercase-casual subs,
 * shouty kickers.
 */
export function specFor(type: OutboxEventType, payload: Payload): CardSpec | null {
  // Feature-contributed cards win; core cards fall through to the switch.
  const contrib = feedContribution(type)?.spec?.(payload);
  if (contrib) return contrib;
  switch (type) {
    case "recipe.created":
      return {
        module: "cookbook",
        kicker: "NEW RECIPE",
        headline: str(payload, "title") ?? "Untitled",
        sub: "added by {actor}",
        actorId: str(payload, "authorId"),
        path: `/cookbook/${str(payload, "recipeId") ?? ""}`,
      };
    case "event.created": {
      const when = formatWhen(str(payload, "startAt"));
      return {
        module: "events",
        kicker: "NEW EVENT",
        headline: str(payload, "title") ?? "Untitled",
        sub: when ? `${when} · hosted by {actor}` : "hosted by {actor}",
        actorId: str(payload, "creatorId"),
        path: `/events/${str(payload, "eventId") ?? ""}`,
      };
    }
    case "event.rsvp.changed": {
      const status = str(payload, "status");
      const verb =
        status === "going" ? "{actor} is in" :
        status === "maybe" ? "{actor} might make it" :
        "{actor} is out";
      return {
        module: "events",
        kicker: "RSVP",
        headline: str(payload, "eventTitle") ?? "An event",
        sub: verb,
        actorId: str(payload, "userId"),
        path: `/events/${str(payload, "eventId") ?? ""}`,
      };
    }
    case "poll.created":
      return {
        module: "polls",
        kicker: "NEW POLL",
        headline: str(payload, "question") ?? "A question",
        sub: "asked by {actor} — go vote",
        actorId: str(payload, "createdBy"),
        path: "/polls",
      };
    case "poll.results.revealed":
      return {
        module: "polls",
        kicker: "RESULTS UNSEALED",
        headline: str(payload, "question") ?? "A poll",
        sub: `${num(payload, "votes") ?? "the"} votes are in`,
        path: "/polls",
      };
    case "listing.created":
      return {
        module: "marketplace",
        kicker: "FOR SALE",
        headline: str(payload, "title") ?? "Something",
        sub: `${formatPrice(num(payload, "priceCents"))} · listed by {actor}`,
        actorId: str(payload, "sellerId"),
        path: "/marketplace",
      };
    case "listing.claimed":
      return {
        module: "marketplace",
        kicker: "CLAIMED",
        headline: str(payload, "title") ?? "Something",
        sub: "snagged by {actor}",
        actorId: str(payload, "claimedBy"),
        path: "/marketplace",
      };
    case "idea.created":
      return {
        module: "ideas",
        kicker: "NEW IDEA",
        headline: str(payload, "title") ?? "An idea",
        sub: "dropped in the box by {actor}",
        actorId: str(payload, "authorId"),
        path: "/ideas",
      };
    case "map.pin.added":
      return {
        module: "map",
        kicker: "NEW PIN",
        headline: str(payload, "name") ?? "Somewhere",
        sub: `${str(payload, "category") ?? "spot"} · pinned by {actor}`,
        actorId: str(payload, "addedBy"),
        path: "/map",
      };
    case "wishlist.added":
      return {
        module: "wishlist",
        kicker: "WISHLISTED",
        headline: str(payload, "title") ?? "Something",
        sub: "{actor} wants this",
        actorId: str(payload, "userId"),
        path: "/wishlist",
      };
    case "arcade.highscore": {
      const score = num(payload, "score");
      const game = str(payload, "game") ?? "the arcade";
      return {
        module: "snake",
        kicker: "NEW RECORD",
        headline: `${score?.toLocaleString("en-US") ?? "?"} pts`,
        sub: `{actor} just took the ${game} crown`,
        actorId: str(payload, "userId"),
        path: "/snake",
      };
    }
    case "countdown.created": {
      const when = formatWhen(str(payload, "targetAt"));
      const emoji = str(payload, "emoji");
      return {
        module: "countdowns",
        kicker: "CLOCK STARTED",
        headline: `${emoji ? `${emoji} ` : ""}${str(payload, "title") ?? "Something"}`,
        sub: when ? `lands ${when} · by {actor}` : "by {actor}",
        actorId: str(payload, "creatorId"),
        path: "/countdowns",
      };
    }
    case "member.added":
      return {
        module: "home",
        kicker: "NEW MEMBER",
        headline: "Someone joined the crew",
        sub: "invited by {actor}",
        actorId: str(payload, "addedBy"),
        path: "/",
      };
    default:
      return null;
  }
}

/**
 * Which posted cards should be tracked (as a DiscordMessageRef) so they can be
 * live-edited later. Poll / listing / event cards carry interactive buttons
 * whose state changes (vote tally, CLAIMED, RSVP counts) we rewrite in place.
 */
export function trackRefFor(
  type: OutboxEventType,
  payload: Payload
): { kind: string; refId: string } | null {
  switch (type) {
    case "poll.created": {
      const id = str(payload, "pollId");
      return id ? { kind: "poll", refId: id } : null;
    }
    case "listing.created": {
      const id = str(payload, "listingId");
      return id ? { kind: "listing", refId: id } : null;
    }
    case "event.created": {
      const id = str(payload, "eventId");
      return id ? { kind: "event", refId: id } : null;
    }
    default:
      return null;
  }
}
