/**
 * DEMO DATA — temporary, for pre-deploy testing. `npm run db:demo` to
 * load, `npm run db:demo:remove` to wipe.
 *
 * Everything here is owned by demo users (*@demo.udmplus.local), so
 * removal is just deleting those users and letting cascades do the
 * rest (plus outbox rows, which are flagged payload.demo = true).
 * Demo content never touches real members' rows.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

// tsx doesn't load .env; Prisma only reads DATABASE_URL from it. The
// vault crypto needs VAULT_KEY/AUTH_SECRET, so load the rest ourselves.
for (const line of readFileSync(join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { encryptSecret } from "../src/lib/crypto";

const db = new PrismaClient();

const DEMO_DOMAIN = "demo.udmplus.local";

function daysFromNow(days: number, hour = 19): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  const existing = await db.user.findFirst({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
  });
  if (existing) {
    console.log("Demo data already loaded. Run `npm run db:demo:remove` first to reload.");
    return;
  }

  // ---- Demo members (initials MD / JD / RD in avatars) ----
  const [maya, jordan, riley] = await Promise.all(
    [
      { email: `maya@${DEMO_DOMAIN}`, displayName: "Maya Demo", venmoHandle: "maya-demo" },
      { email: `jordan@${DEMO_DOMAIN}`, displayName: "Jordan Demo", venmoHandle: "jordan-demo" },
      { email: `riley@${DEMO_DOMAIN}`, displayName: "Riley Demo" },
    ].map((data) => db.user.create({ data }))
  );
  console.log("✓ 3 demo members");

  // ---- Contact cards (People) ----
  await db.contactCard.create({
    data: {
      userId: maya.id,
      phone: "512-555-0142",
      birthday: new Date("1993-04-18"),
      address: "808 Demo Loop\nAustin, TX 78704",
      notes: "Allergic to cilantro. Do not test this.",
      relatedParties: {
        create: [{ name: "Sam Demo", relation: "partner", phone: "512-555-0143" }],
      },
    },
  });
  await db.contactCard.create({
    data: {
      userId: jordan.id,
      phone: "512-555-0177",
      birthday: new Date("1991-11-02"),
      address: "22 Placeholder Ave\nAustin, TX 78702",
      relatedParties: {
        create: [{ name: "Dana Demo", relation: "emergency", phone: "512-555-0178" }],
      },
    },
  });
  console.log("✓ contact cards + related parties");

  // ---- Cookbook ----
  await db.recipe.createMany({
    data: [
      {
        authorId: maya.id,
        title: "Maya's One-Pan Salmon Situation",
        body: [
          "Weeknight hero. Zero dishes, maximum smug.",
          "",
          "## You need",
          "- Salmon filets",
          "- A bag of green beans",
          "- Soy sauce, honey, garlic, sriracha",
          "",
          "## Do this",
          "1. Whisk the sauce. Taste it. Add more sriracha, coward.",
          "2. Everything on one sheet pan, 400°F for 14 minutes.",
          "3. Accept compliments.",
        ].join("\n"),
      },
      {
        authorId: jordan.id,
        title: "Jordan's Game Night Queso",
        body: [
          "The reason people show up on time.",
          "",
          "## You need",
          "- White american cheese (the deli kind, trust)",
          "- A can of Rotel",
          "- Splash of milk",
          "",
          "## Do this",
          "1. Low heat. Stir like you mean it.",
          "2. Serve in the crock pot so it never dies.",
        ].join("\n"),
      },
      {
        authorId: riley.id,
        title: "Riley's 4-Ingredient Banana Bread",
        body: "Bananas (3, ashamed), flour, condensed milk, baking soda. 350°F, 50 min. That's the recipe. That's the whole recipe.",
      },
    ],
  });
  console.log("✓ 3 recipes");

  // ---- Events: upcoming ×2, past ×1, mixed RSVPs ----
  const trivia = await db.event.create({
    data: {
      creatorId: jordan.id,
      title: "Trivia Night at the Demo Tavern",
      description: "We lost by one point last time. ONE POINT. Redemption arc.",
      location: "Demo Tavern, back room",
      startAt: daysFromNow(3),
      rsvps: {
        create: [
          { userId: maya.id, status: "going" },
          { userId: jordan.id, status: "going" },
          { userId: riley.id, status: "maybe" },
        ],
      },
    },
  });
  await db.event.create({
    data: {
      creatorId: maya.id,
      title: "Lake Day (Demo Edition)",
      description: "Floats mandatory. Sunscreen non-negotiable.",
      location: "The lake, obviously",
      startAt: daysFromNow(16, 10),
      endAt: daysFromNow(16, 17),
      rsvps: { create: [{ userId: maya.id, status: "going" }] },
    },
  });
  await db.event.create({
    data: {
      creatorId: riley.id,
      title: "That Dinner We Already Had",
      description: "A past event so the archive view has something in it.",
      location: "Riley's place",
      startAt: daysFromNow(-9),
      rsvps: {
        create: [
          { userId: riley.id, status: "going" },
          { userId: maya.id, status: "no" },
        ],
      },
    },
  });
  console.log("✓ 3 events + RSVPs");

  // ---- Now Playing: active + finished (graveyard) ----
  await db.nowPlayingItem.createMany({
    data: [
      { userId: maya.id, mediaType: "show", title: "The Bear", note: "Yes chef." },
      { userId: jordan.id, mediaType: "movie", title: "Dune Part Two", note: "Sand. So much sand." },
      { userId: riley.id, mediaType: "book", title: "Tomorrow, and Tomorrow, and Tomorrow", note: "Crying about video games." },
      { userId: jordan.id, mediaType: "show", title: "Demo Drive to Survive", note: "Finished it. It finished me.", status: "finished" },
      { userId: maya.id, mediaType: "book", title: "A Book I Gave Up On", note: "DNF at 40%. No regrets.", status: "finished" },
    ],
  });
  console.log("✓ 5 now-playing items (2 in the graveyard)");

  // ---- Files (NOTE: storage keys are fake — list/UI testable, downloads 404 without S3) ----
  await db.fileObject.createMany({
    data: [
      { uploaderId: maya.id, filename: "group-photo-lake-day.jpg", mimeType: "image/jpeg", sizeBytes: 2_400_000, storageKey: "demo/group-photo-lake-day.jpg" },
      { uploaderId: jordan.id, filename: "trivia-scoresheet.pdf", mimeType: "application/pdf", sizeBytes: 89_000, storageKey: "demo/trivia-scoresheet.pdf" },
      { uploaderId: riley.id, filename: "cursed-meme.png", mimeType: "image/png", sizeBytes: 410_000, storageKey: "demo/cursed-meme.png" },
    ],
  });
  console.log("✓ 3 files (fake storage keys — downloads won't resolve locally)");

  // ---- Wishlist ----
  await db.wishlistItem.createMany({
    data: [
      { userId: maya.id, title: "Cast iron dutch oven (the orange one)", url: "https://example.com/dutch-oven", siteName: "example.com", note: "7qt or go home" },
      { userId: maya.id, title: "Tickets to literally any concert", note: "Surprise me" },
      { userId: jordan.id, title: "Mechanical keyboard (quiet switches, I promise)", url: "https://example.com/keyboard", siteName: "example.com" },
      { userId: riley.id, title: "Fancy olive oil", note: "The kind that comes in a tin" },
    ],
  });
  console.log("✓ 4 wishlist items");

  // ---- Vault (real encryption via src/lib/crypto) ----
  await db.vaultEntry.createMany({
    data: [
      {
        creatorId: jordan.id,
        siteName: "Demo Streaming Service",
        siteUrl: "https://stream.example.com",
        username: "the-group@example.com",
        passwordEnc: encryptSecret("hunter2-but-demo"),
        notes: "Profile 4 is free. Do not touch Maya's continue-watching.",
      },
      {
        creatorId: maya.id,
        siteName: "Demo Wifi (the good router)",
        username: "admin",
        passwordEnc: encryptSecret("correct-horse-demo-staple"),
      },
    ],
  });
  console.log("✓ 2 vault entries (encrypted at rest)");

  // ---- Map pins (around Austin, TX) ----
  await db.mapPin.createMany({
    data: [
      { creatorId: maya.id, name: "The Good Taco Truck", category: "food", lat: 30.2627, lng: -97.7467, note: "Cash only. Get the migas." },
      { creatorId: jordan.id, name: "Demo Tavern", category: "drink", lat: 30.267, lng: -97.7435, note: "Trivia on Thursdays" },
      { creatorId: riley.id, name: "Secret Swimming Hole", category: "outdoors", lat: 30.2442, lng: -97.7723, note: "Park on the gravel side" },
      { creatorId: maya.id, name: "Maya & Sam's", category: "home", lat: 30.245, lng: -97.755 },
    ],
  });
  console.log("✓ 4 map pins");

  // ---- Ideas: open w/ votes, planned, done ----
  await db.idea.create({
    data: {
      authorId: riley.id,
      title: "Annual group camping trip",
      detail: "Three days, no cell service, one (1) communal cast iron.",
      votes: { create: [{ userId: maya.id }, { userId: jordan.id }, { userId: riley.id }] },
    },
  });
  await db.idea.create({
    data: {
      authorId: maya.id,
      title: "Monthly cook-off with a theme ingredient",
      detail: "Loser does dishes. Winner picks next ingredient.",
      votes: { create: [{ userId: jordan.id }] },
    },
  });
  await db.idea.create({
    data: {
      authorId: jordan.id,
      title: "Shared photo frame for the group chat pics",
      status: "planned",
      votes: { create: [{ userId: maya.id }, { userId: riley.id }] },
    },
  });
  await db.idea.create({
    data: { authorId: riley.id, title: "Make a group app (this one)", status: "done" },
  });
  console.log("✓ 4 ideas across all statuses");

  // ---- Marketplace: every listing status ----
  await db.listing.createMany({
    data: [
      { sellerId: jordan.id, title: "Air fryer, barely used", description: "Upgraded to a bigger one. This one's great, just small.", priceCents: 3500, delivery: "pickup" },
      { sellerId: maya.id, title: "Box of assorted plant cuttings", description: "Pothos propagation got out of hand.", priceCents: null, delivery: "either" },
      { sellerId: riley.id, title: "Standing desk frame", description: "Heavy. Bring a friend (not me).", priceCents: 9000, delivery: "pickup", status: "claimed", claimedById: maya.id, claimedAt: daysFromNow(-2, 14) },
      { sellerId: maya.id, title: "Concert poster, framed", priceCents: 1500, delivery: "pickup", status: "gone", claimedById: jordan.id, claimedAt: daysFromNow(-12, 9) },
    ],
  });
  console.log("✓ 4 listings (available / free / claimed / gone)");

  // ---- Polls: open single, open anonymous multi, closed scale ----
  await db.poll.create({
    data: {
      creatorId: maya.id,
      question: "Where should Lake Day lunch come from?",
      type: "single",
      options: {
        create: [
          { label: "The Good Taco Truck", order: 0 },
          { label: "Sandwich tower (BYO)", order: 1 },
          { label: "That overpriced salad place", order: 2 },
        ],
      },
    },
  }).then(async (poll) => {
    const opts = await db.pollOption.findMany({ where: { pollId: poll.id }, orderBy: { order: "asc" } });
    await db.pollVote.createMany({
      data: [
        { pollId: poll.id, userId: maya.id, optionId: opts[0].id },
        { pollId: poll.id, userId: jordan.id, optionId: opts[0].id },
        { pollId: poll.id, userId: riley.id, optionId: opts[1].id },
      ],
    });
  });
  await db.poll.create({
    data: {
      creatorId: riley.id,
      question: "Honestly, who's been skipping trivia?",
      type: "multi",
      anonymous: true,
      options: {
        create: [
          { label: "Work, allegedly", order: 0 },
          { label: "Just forgot", order: 1 },
          { label: "Was there in spirit", order: 2 },
        ],
      },
    },
  }).then(async (poll) => {
    const opts = await db.pollOption.findMany({ where: { pollId: poll.id }, orderBy: { order: "asc" } });
    await db.pollVote.createMany({
      data: [
        { pollId: poll.id, userId: maya.id, optionId: opts[1].id },
        { pollId: poll.id, userId: jordan.id, optionId: opts[0].id },
        { pollId: poll.id, userId: jordan.id, optionId: opts[2].id },
      ],
    });
  });
  await db.poll.create({
    data: {
      creatorId: jordan.id,
      question: "Rate the new queso recipe",
      type: "scale",
      closedAt: daysFromNow(-1, 12),
      votes: {
        create: [
          { userId: maya.id, rating: 5 },
          { userId: jordan.id, rating: 5 },
          { userId: riley.id, rating: 4 },
        ],
      },
    },
  });
  console.log("✓ 3 polls (open / anonymous / closed)");

  // ---- Reveal: open rank (below minSubmitters), revealed oracle, sealed note ----
  await db.revealPrompt.create({
    data: {
      creatorId: maya.id,
      type: "rank",
      title: "Rank the group road-trip snacks",
      items: ["Gas station taquitos", "Trail mix (the good kind)", "A concerning amount of jerky", "Sour candy"],
      minSubmitters: 3,
      deadline: daysFromNow(5),
      submissions: {
        create: [
          { userId: maya.id, payload: { order: [3, 1, 0, 2] } },
          { userId: jordan.id, payload: { order: [0, 3, 2, 1] } },
        ],
      },
    },
  });
  await db.revealPrompt.create({
    data: {
      creatorId: jordan.id,
      type: "oracle",
      title: "How likely is the camping trip to actually happen? (1–10)",
      scaleMax: 10,
      minSubmitters: 3,
      status: "revealed",
      revealedAt: daysFromNow(-1, 18),
      submissions: {
        create: [
          { userId: maya.id, payload: { value: 8 } },
          { userId: jordan.id, payload: { value: 9 } },
          { userId: riley.id, payload: { value: 4 } },
        ],
      },
    },
  });
  await db.revealPrompt.create({
    data: {
      creatorId: riley.id,
      type: "sealed",
      title: "Predictions for this year (open on New Year's)",
      unlockAt: daysFromNow(120),
      submissions: {
        create: [{ userId: riley.id, payload: { body: "Someone in this group gets a dog. Calling it now." } }],
      },
    },
  });
  console.log("✓ 3 reveal prompts (open / revealed / sealed)");

  // ---- Stakes: open vs claim, hidden solo, resolved+unsettled, forfeit pool + spin ----
  await db.claim.createMany({
    data: [
      {
        creatorId: jordan.id,
        text: "We win trivia outright this Thursday",
        resolvesAt: daysFromNow(4),
        counterpartyId: riley.id,
        stake: "Loser buys the first round",
      },
      {
        creatorId: maya.id,
        text: "(hidden until resolution — solo prediction)",
        resolvesAt: daysFromNow(30),
        hidden: true,
      },
      {
        creatorId: riley.id,
        text: "It rains on Lake Day",
        resolvesAt: daysFromNow(-3),
        counterpartyId: maya.id,
        stake: "Winner picks the next movie night film",
        outcome: "wrong",
        resolvedAt: daysFromNow(-3, 20),
        resolvedById: maya.id,
      },
    ],
  });
  const forfeits = await Promise.all([
    db.forfeit.create({ data: { authorId: maya.id, text: "Speak only in movie quotes for one hour" } }),
    db.forfeit.create({ data: { authorId: jordan.id, text: "Bring homemade snacks to the next three hangs" } }),
    db.forfeit.create({ data: { authorId: riley.id, text: "Profile picture of the group's choosing for a week" } }),
  ]);
  await db.forfeitSpin.create({
    data: { forfeitId: forfeits[0].id, targetId: riley.id, spunById: maya.id, reason: "Lost the rain bet" },
  });
  console.log("✓ 3 claims + 3 forfeits + 1 spin");

  // ---- New-feature samples: sealed-results poll + early-unseal sealed note ----
  await db.poll.create({
    data: {
      creatorId: maya.id,
      question: "Secret ballot: best dish at the last potluck?",
      type: "single",
      anonymous: true,
      revealThreshold: 2,
      options: {
        create: [
          { label: "The queso (obviously)", order: 0 },
          { label: "Riley's banana bread", order: 1 },
          { label: "The mystery casserole", order: 2 },
        ],
      },
    },
  }).then(async (poll) => {
    const opts = await db.pollOption.findMany({ where: { pollId: poll.id }, orderBy: { order: "asc" } });
    await db.pollVote.createMany({
      data: [
        { pollId: poll.id, userId: jordan.id, optionId: opts[0].id },
        { pollId: poll.id, userId: riley.id, optionId: opts[1].id },
      ],
    });
    // one reveal vote in — one more unlocks the results
    await db.pollRevealVote.create({ data: { pollId: poll.id, userId: jordan.id } });
  });
  await db.revealPrompt.create({
    data: {
      creatorId: maya.id,
      type: "sealed",
      title: "My prediction about the camping trip (vote to unseal!)",
      unlockAt: daysFromNow(60),
      unlockVotesNeeded: 2,
      submissions: {
        create: [{ userId: maya.id, payload: { body: "We forget the tent poles. Someone cries. It's me." } }],
      },
      unlockVotes: { create: [{ userId: riley.id }] },
    },
  });
  console.log("✓ sealed-results poll + early-unseal sealed note");

  // ---- Pet: outbox activity over the past week (flagged demo:true) + nudges ----
  const outboxTypes = [
    "recipe.created", "event.created", "event.rsvp.changed", "nowplaying.updated",
    "idea.created", "idea.voted", "poll.created", "poll.voted",
    "listing.created", "wishlist.created", "mappin.created", "claim.created",
  ];
  await db.outboxEvent.createMany({
    data: outboxTypes.map((type, i) => ({
      type,
      payload: { demo: true },
      createdAt: daysFromNow(-(i % 6), 9 + (i % 8)),
    })),
  });
  await db.petNudge.createMany({
    data: [{ userId: maya.id }, { userId: jordan.id }],
  });
  console.log("✓ 12 outbox events (pet food) + 2 nudges");

  console.log("\nDemo data loaded. Remove with: npm run db:demo:remove");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
