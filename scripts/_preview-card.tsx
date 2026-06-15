import fs from "node:fs";
import { renderCardPng } from "@/lib/discord/card";
import type { CardSpec, CardExtras } from "@/lib/discord/feed";

const stamp = Date.now();
const out = `/tmp/cards-${stamp}`;
fs.mkdirSync(out, { recursive: true });

const cases: { name: string; spec: CardSpec; actor: string | null; extras: CardExtras }[] = [
  {
    name: "poll-short",
    spec: { module: "polls", kicker: "NEW POLL", headline: "how was everyone's weekend?", sub: "asked by Puddlelift", path: "/polls" },
    actor: "Puddlelift",
    extras: { badge: "PICK ONE", options: ["10/10 no notes", "solid", "mid", "we don't talk about it"] },
  },
  {
    name: "poll-long-everything",
    spec: { module: "polls", kicker: "NEW POLL", headline: "what should we do for the big group trip next month — be honest", sub: "asked by Andre", path: "/polls" },
    actor: "Andre",
    extras: {
      badge: "PICK ANY",
      options: [
        "rent a cabin somewhere with terrible cell service",
        "beach house, obviously",
        "a city we've never been to",
        "stay home and save the money for once",
        "ask me again when i'm less broke",
        "literally anywhere with a hot tub",
      ],
    },
  },
  {
    name: "event",
    spec: { module: "events", kicker: "NEW EVENT", headline: "Friday game night at my place", sub: "hosted by Andre", path: "/events" },
    actor: "Andre",
    extras: { facts: [{ label: "WHEN", value: "Fri, Jun 20 · 7:00 PM" }, { label: "WHERE", value: "Andre's apartment, buzz #4" }] },
  },
  {
    name: "listing",
    spec: { module: "marketplace", kicker: "FOR SALE", headline: "IKEA standing desk, barely used", sub: "listed by Sam", path: "/marketplace" },
    actor: "Sam",
    extras: { badge: "$40", facts: [{ label: "PICKUP", value: "Pickup or delivery" }] },
  },
  {
    name: "idea",
    spec: { module: "ideas", kicker: "NEW IDEA", headline: "weekly cabin trip fund", sub: "dropped in the box by Mia", path: "/ideas" },
    actor: "Mia",
    extras: { facts: [{ label: "DETAIL", value: "everyone chips in $20/mo toward a yearly cabin" }] },
  },
  {
    name: "recipe-minimal",
    spec: { module: "cookbook", kicker: "NEW RECIPE", headline: "Grandma's actually-good lasagna", sub: "added by Theo", path: "/cookbook" },
    actor: "Theo",
    extras: {},
  },
];

async function main() {
  for (const c of cases) {
    const png = await renderCardPng(c.spec, c.actor, c.extras);
    fs.writeFileSync(`${out}/${c.name}.png`, png);
  }
  console.log(`wrote ${cases.length} cards to ${out}/`);
  for (const c of cases) console.log(`  ${out}/${c.name}.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
