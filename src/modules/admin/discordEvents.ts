/**
 * The outbox events that actually render a Discord card (everything mapped in
 * specFor()). The Discord tab toggles these on/off; the drainer reads the
 * disabled set from AppConfig "discord.feeds". Pure — safe to import anywhere.
 *
 * Keep in sync with specFor() in src/lib/discord/feed.ts: an event not listed
 * here never posts regardless, so there's nothing to toggle.
 */

export type DiscordEventDef = { type: string; label: string; group: string };

export const DISCORD_EVENTS: DiscordEventDef[] = [
  { type: "member.added", label: "New member joins", group: "Members" },
  { type: "recipe.created", label: "Recipe posted", group: "Cookbook" },
  { type: "event.created", label: "Event created", group: "Events" },
  { type: "event.rsvp.changed", label: "RSVP changed", group: "Events" },
  { type: "countdown.created", label: "Countdown started", group: "Events" },
  { type: "poll.created", label: "Poll posted", group: "Polls" },
  { type: "poll.results.revealed", label: "Poll results unsealed", group: "Polls" },
  { type: "idea.created", label: "Idea posted", group: "Ideas" },
  { type: "listing.created", label: "Listing for sale", group: "Marketplace" },
  { type: "listing.claimed", label: "Listing claimed", group: "Marketplace" },
  { type: "wishlist.added", label: "Wish added", group: "Wishlist" },
  { type: "map.pin.added", label: "Map pin dropped", group: "Map" },
  { type: "arcade.highscore", label: "New high score", group: "Arcade" },
  { type: "fitness.plan.created", label: "Program forged", group: "The Pump" },
  { type: "fitness.pr.set", label: "PR set", group: "The Pump" },
  { type: "fitness.week.conquered", label: "Week conquered (3+ sessions)", group: "The Pump" },
];
