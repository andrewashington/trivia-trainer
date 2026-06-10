import type { IconName } from "@/components/icons";

/**
 * The module registry: each feature plugs into the shell here.
 * Adding a module = create its folder under src/modules + src/app
 * routes, then append one entry (and pick its category). No edits to
 * existing modules.
 */
export type CategoryKey = "quests" | "shelf" | "stash" | "forum" | "arcade";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  icon: IconName;
  /** One-line answer to "what lives in here?" — shown in nav surfaces. */
  tagline: string;
  /** Tailwind class for the category's accent surface (nav). */
  accentBg: string;
};

/**
 * The five shelves of the cartridge. Every module belongs to exactly
 * one; nav surfaces (sidebar sections, mobile tab sheets) are built
 * from this list.
 */
export const categories: CategoryDef[] = [
  {
    key: "quests",
    label: "Quests",
    icon: "sword",
    tagline: "Plans, places & people",
    accentBg: "bg-accent-blue",
  },
  {
    key: "shelf",
    label: "Shelf",
    icon: "library",
    tagline: "The shared shelf you consume from",
    accentBg: "bg-accent-yellow",
  },
  {
    key: "stash",
    label: "Stash",
    icon: "backpack",
    tagline: "Stuff you own, want, and swap",
    accentBg: "bg-accent-green",
  },
  {
    key: "forum",
    label: "Forum",
    icon: "megaphone",
    tagline: "Pitches, votes & secrets",
    accentBg: "bg-accent-indigo",
  },
  {
    key: "arcade",
    label: "Arcade",
    icon: "gamepad",
    tagline: "Fun & games",
    accentBg: "bg-accent-pink",
  },
];

export type ModuleDef = {
  key: string;
  label: string;
  /** Pixel icon name (see src/components/icons.tsx). */
  icon: IconName;
  category: CategoryKey;
  navOrder: number;
  href: string;
  /** Tailwind class for the module's accent surface (nav + headers). */
  accentBg: string;
  /** One-liner shown on the module's first-visit intro card. */
  intro: string;
  /** 2-3 "try this" pointers on the intro card — concrete first moves. */
  tips: string[];
  /**
   * Hidden modules never show in nav, the home chips, or category
   * shelves — you have to know the URL. Intro cards and seen-tracking
   * still work once you're there.
   */
  hidden?: boolean;
};

export const modules: ModuleDef[] = [
  {
    key: "cookbook",
    label: "Cookbook",
    icon: "book-open",
    category: "shelf",
    navOrder: 1,
    href: "/cookbook",
    accentBg: "bg-accent-red",
    intro: "The group cookbook. Save the recipes worth repeating — markdown welcome, photos too.",
    tips: [
      "Post a recipe — plain markdown, so paste from anywhere",
      "Attach a photo as proof it actually came out like that",
      "Steal someone else's recipe for dinner tonight",
    ],
  },
  {
    key: "events",
    label: "Events",
    icon: "calendar",
    category: "quests",
    navOrder: 2,
    href: "/events",
    accentBg: "bg-accent-blue",
    intro: "Plan the hangs. RSVPs, details, and an iCal feed your calendar can subscribe to.",
    tips: [
      "Make an event and watch the RSVPs roll in",
      "Subscribe your phone's calendar to the iCal feed (on your profile)",
      "RSVP 'maybe' and keep everyone guessing",
    ],
  },
  {
    key: "nowplaying",
    label: "Now Playing",
    icon: "tv",
    category: "shelf",
    navOrder: 3,
    href: "/nowplaying",
    accentBg: "bg-accent-yellow",
    intro: "What everyone's watching, reading, and playing right now. Add yours, judge freely.",
    tips: [
      "Add what you're watching, reading, or playing",
      "Mark something finished to move it off your list",
      "Find your next show by raiding everyone else's lists",
    ],
  },
  {
    key: "files",
    label: "Files",
    icon: "folder",
    category: "shelf",
    navOrder: 4,
    href: "/files",
    accentBg: "bg-accent-green",
    intro: "The shared stash. Drop files in, grab them with short-lived private links.",
    tips: [
      "Upload images or PDFs — the group meme archive starts here",
      "Links are private and expire — share freely",
    ],
  },
  {
    key: "wishlist",
    label: "Wishlist",
    icon: "gift",
    category: "stash",
    navOrder: 5,
    href: "/wishlist",
    accentBg: "bg-accent-orange",
    intro: "Everyone's wish lists with link previews — so birthdays stop being a guessing game.",
    tips: [
      "Paste a product link — it pulls the picture automatically",
      "Browse everyone else's lists before the next birthday",
      "Keep yours updated so you stop getting socks",
    ],
  },
  {
    key: "contacts",
    label: "People",
    icon: "contact",
    category: "quests",
    navOrder: 6,
    href: "/contacts",
    accentBg: "bg-accent-pink",
    intro: "The group address book: numbers, addresses, birthdays, and who to call in a pinch.",
    tips: [
      "Fill in your own card — phone, address, birthday",
      "Add your partner or emergency contact as a related party",
      "Never ask the chat for someone's address again",
    ],
  },
  {
    key: "vault",
    label: "Vault",
    icon: "lock",
    category: "stash",
    navOrder: 7,
    href: "/vault",
    accentBg: "bg-accent-cyan",
    intro: "Shared logins, encrypted at rest. Passwords reveal one at a time, only when you ask.",
    tips: [
      "Add a shared login the whole group uses",
      "Tap reveal to decrypt a password — one at a time, on purpose",
      "Passwords are encrypted at rest; backups stay safe",
    ],
  },
  {
    key: "map",
    label: "Map",
    icon: "map-pin",
    category: "quests",
    navOrder: 8,
    href: "/map",
    accentBg: "bg-accent-teal",
    intro: "The group atlas. Pin the good taco truck, trip ideas, and everyone's favorites.",
    tips: [
      "Drop a pin on the good taco truck",
      "Search any address to pin it — no API keys, all free maps",
      "Categorize pins: food, drinks, outdoors, trip ideas",
    ],
  },
  {
    key: "ideas",
    label: "Ideas",
    icon: "lightbulb",
    category: "forum",
    navOrder: 9,
    href: "/ideas",
    accentBg: "bg-accent-lime",
    intro: "The suggestion box. Pitch an idea, vote on the rest, watch the winners get shipped.",
    tips: [
      "Pitch anything — trips, traditions, dumb bits",
      "You get one vote per idea; make it count",
      "Admins move winners to planned, then done",
    ],
  },
  {
    key: "marketplace",
    label: "Market",
    icon: "store",
    category: "stash",
    navOrder: 10,
    href: "/marketplace",
    accentBg: "bg-accent-magenta",
    intro: "The group garage sale. List it, claim it first-come-first-served, settle on Venmo.",
    tips: [
      "List something you're done with — price it or mark it free",
      "Claiming is first-come-first-served and atomic, so be quick",
      "Money changes hands on Venmo, not here",
    ],
  },
  {
    key: "polls",
    label: "Polls",
    icon: "chart-bar-big",
    category: "forum",
    navOrder: 11,
    href: "/polls",
    accentBg: "bg-accent-indigo",
    intro: "Decide together. Pick one, pick any, or rate it — anonymous or blind when it needs to be.",
    tips: [
      "Ask the group anything — pick one, pick any, or rate 1–5",
      "Go anonymous for the spicy questions, blind to avoid anchoring",
      "Close the poll when the people have spoken",
    ],
  },
  {
    key: "reveal",
    label: "Reveal",
    icon: "eye",
    category: "forum",
    navOrder: 12,
    href: "/reveal",
    accentBg: "bg-ink",
    intro: "Everyone ranks blind, then it all unmasks at once — or seal a time capsule for the future.",
    tips: [
      "Rank the prompt — nobody sees anything until everyone's in",
      "When the last person submits, all answers unmask at once",
      "Time capsules stay sealed until their date. Even from you",
    ],
  },
  {
    key: "stakes",
    label: "Stakes",
    icon: "target",
    category: "arcade",
    navOrder: 13,
    href: "/stakes",
    accentBg: "bg-accent-forest",
    intro: "Call your shots. Friendly bets with deadlines, receipts, and consequences.",
    tips: [
      "Call a shot: what happens, by when, what's on the line",
      "Pick a counterparty or bet against the field",
      "Resolution day comes with receipts",
    ],
  },
  {
    key: "pet",
    label: "Pet",
    icon: "downasaur",
    category: "arcade",
    navOrder: 14,
    href: "/pet",
    accentBg: "bg-accent-sky",
    intro: "A little creature powered by group activity. Quiet weeks make it sad. Keep it fed.",
    tips: [
      "It feeds on group activity — posts, RSVPs, votes, anything",
      "Quiet weeks make it sad. It never dies, but it remembers",
      "Give it a nudge if it's looking rough",
    ],
  },
  {
    key: "countdowns",
    label: "Countdowns",
    icon: "clock",
    category: "quests",
    navOrder: 16,
    href: "/countdowns",
    accentBg: "bg-accent-punch",
    intro: "The group hype clock. Trips, releases, birthdays — watch the seconds drain together.",
    tips: [
      "Add anything worth counting down to — slap an emoji on it",
      "Upcoming events and birthdays show up automatically",
      "Be on the page when one hits zero. Trust us",
    ],
  },
  {
    key: "tanks",
    label: "Tanks",
    icon: "bullseye-arrow",
    category: "arcade",
    navOrder: 17,
    href: "/tanks",
    accentBg: "bg-accent-orange",
    intro:
      "Async artillery duels. Pick an angle, mind the wind, blow up your friends — one shot per turn, on your own time.",
    tips: [
      "Challenge someone — you each fire one shot per turn",
      "Wind changes every turn; the arrow tells you which way",
      "The terrain remembers every crater. Use that",
    ],
  },
  {
    key: "snake",
    label: "Snake",
    icon: "apple",
    category: "arcade",
    navOrder: 15,
    href: "/snake",
    accentBg: "bg-accent-grape",
    intro: "Feed the snake. Chase combos, dodge yourself, and stamp your name on the leaderboard.",
    tips: [
      "Arrow keys or WASD on desktop, swipe on your phone",
      "Eat fast to build a combo multiplier — it decays if you dawdle",
      "Grab the golden snack before it vanishes for a fat bonus",
    ],
  },
  {
    key: "trivia",
    label: "Trivia",
    icon: "circle-question",
    category: "arcade",
    navOrder: 17,
    href: "/trivia",
    accentBg: "bg-accent-ocean",
    intro: "Quick-fire pub trivia. Ten questions, four choices, no second guesses — climb the board.",
    tips: [
      "Hit start for a 10-question round — answers lock instantly",
      "A perfect 10/10 earns the full confetti treatment",
      "Your best round goes on the leaderboard. No pressure",
    ],
  },
  {
    key: "howgay",
    label: "How Gay?",
    icon: "sparkles",
    category: "arcade",
    navOrder: 18,
    href: "/howgay",
    accentBg: "bg-accent-fuchsia",
    intro:
      "Press the button, receive today's scientifically* unimpeachable gayness reading. (*not science)",
    tips: [
      "One reading per day — the meter knows, re-pressing won't reroll it",
      "Hit 90%+ and the confetti cannons agree with you",
      "Check the board to see who's serving today",
    ],
  },
  {
    key: "challenges",
    label: "Challenges",
    icon: "bullseye-arrow",
    category: "quests",
    navOrder: 19,
    href: "/challenges",
    accentBg: "bg-accent-rust",
    intro:
      "Throw out a dare — photo contests, scavenger finds, sneaky pics. Submit proof, vote a winner.",
    tips: [
      "Post a challenge — add a deadline to keep it spicy",
      "Submit your proof: words, a photo, or both",
      "Vote for the best entry (not your own) — winner banks 25 coins",
    ],
  },
  {
    key: "photobook",
    label: "Photobook",
    icon: "image",
    category: "shelf",
    navOrder: 18,
    href: "/photobook",
    accentBg: "bg-accent-coral",
    intro: "The group photo album. Pics of you all together — tag who's in the shot.",
    tips: [
      "Upload a pic from the last hang",
      "Tag who's in it — receipts matter",
      "Filter by a person to build their highlight reel",
    ],
  },
  {
    key: "blackjack",
    label: "Blackjack",
    icon: "chess",
    category: "arcade",
    navOrder: 19,
    href: "/blackjack",
    accentBg: "bg-accent-felt",
    intro:
      "House blackjack, real stakes: your coins. Dealer stands on 17, blackjack pays 3:2, splits don't exist here.",
    tips: [
      "Min bet 1 coin, max bet everything you've got",
      "Double down on your first two cards if you're feeling it",
      "The shoe is shuffled server-side — no peeking, no counting",
    ],
  },
  {
    key: "tiers",
    label: "Tiers",
    icon: "crown",
    category: "forum",
    navOrder: 20,
    href: "/tiers",
    accentBg: "bg-accent-crimson",
    intro: "We deserve to make lists. Rank anything S through F — then see what the group really thinks.",
    tips: [
      "Make a list: a title plus the things to rank",
      "Drag (or tap) items into S–F tiers, then save your board",
      "Check the consensus tab once a few people have ranked",
    ],
  },
  {
    key: "treasure",
    label: "Treasure",
    icon: "money",
    category: "arcade",
    navOrder: 21,
    href: "/treasure",
    accentBg: "bg-accent-gold",
    intro:
      "Somewhere on the map a chest holds the pot. One dig a day — and if nobody finds it, the pot rolls over.",
    tips: [
      "One shovel per person per UTC day — spend it well",
      "Watch where friends dug and missed; the board narrows",
      "Unfound pots roll into tomorrow: 500 becomes 1000 becomes…",
    ],
  },
  {
    key: "thekey",
    label: "The Key",
    icon: "door-closed",
    category: "arcade",
    navOrder: 99,
    href: "/key",
    accentBg: "bg-accent-eggplant",
    hidden: true,
    intro:
      "You found the hidden room. The field guide quiz — chart your specs, get your archetype. What happens in here stays in here.",
    tips: [
      "Answer by picture — every option has a diagram, no essay questions",
      "Slide the rulers, pick your cards, file it",
      "Raw answers stay private — only your encoded key can show on your profile",
    ],
  },
];

export function sortedModules(): ModuleDef[] {
  return [...modules].sort((a, b) => a.navOrder - b.navOrder);
}

export function modulesByCategory(key: CategoryKey): ModuleDef[] {
  return sortedModules().filter((m) => m.category === key && !m.hidden);
}
