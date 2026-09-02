import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { DISCORD_API, botConfig } from "@/lib/discord/bot";
import { withOutbox } from "@/lib/outbox";
import { ensureFeatures, commandHandler, componentHandler } from "@/lib/discord/registry";
import { handleUwu } from "@/lib/discord/features/uwu";
import { handleOxford } from "@/lib/discord/features/oxford";
import { handleChandler } from "@/lib/discord/features/chandler";
import { handleJeopardy, handleJeopardyComponent } from "@/lib/discord/features/jeopardy";
import { editTrackedMessage } from "@/lib/discord/messageState";
import { actionRow, button, CARD_IDS } from "@/lib/discord/components";
import { rsvpStatus, claimedStatus, pollStatus } from "@/lib/discord/cardStatus";

/**
 * Interaction dispatcher for the Discord bot. Phase 1: /link and
 * /unlink slash commands. Phase 2: buttons/selects on feed cards
 * (RSVP, poll voting, listing claims, idea upvotes) — each handler
 * mirrors its API route's invariants and writes the same outbox
 * events through withOutbox, so coins and the feed behave identically
 * to in-app actions. Called from the interactions route after
 * signature verification; every handler returns an
 * interaction-response object the route sends back as JSON. Replies
 * are ephemeral — bot chatter stays out of the channel.
 *
 * Interaction wire constants (https://discord.com/developers/docs/interactions):
 *   type 1 = PING, 2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT
 *   response 1 = PONG, 4 = CHANNEL_MESSAGE_WITH_SOURCE, 7 = UPDATE_MESSAGE
 *   flags 64 = ephemeral
 */

const EPHEMERAL = 64;

/**
 * Discord interaction payload. Fields beyond phase-1's needs (channel_id,
 * guild_id, id, resolved, target_id, message) are optional and used by
 * registry-contributed feature handlers (AI Concierge, economy) — they don't
 * change the existing dispatch. Exported so feature modules share one shape.
 */
export type Interaction = {
  type: number;
  id?: string;
  token?: string;
  channel_id?: string;
  guild_id?: string;
  app_permissions?: string;
  data?: {
    name?: string;
    custom_id?: string;
    values?: string[];
    options?: CommandOption[];
    /** Context-menu target id (type 2/3 commands). */
    target_id?: string;
    /** Resolved entities (e.g. messages for a message context menu). */
    resolved?: { messages?: Record<string, ResolvedMessage> };
  };
  message?: { id?: string };
  member?: { user?: DiscordUser; permissions?: string };
  user?: DiscordUser;
};
export type CommandOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: CommandOption[];
};
type DiscordUser = { id: string; username?: string; global_name?: string | null };
type ResolvedMessage = { id: string; content?: string; author?: DiscordUser };

function optValue(options: CommandOption[] | undefined, name: string): string | undefined {
  const v = options?.find((o) => o.name === name)?.value;
  return v === undefined ? undefined : String(v);
}

/** Discord-native timestamp markup: renders in each viewer's timezone. */
const ts = (d: Date, style: "f" | "R" | "d") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I — the user retypes this by hand.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function mintCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function ephemeralReply(content: string) {
  return { type: 4, data: { content, flags: EPHEMERAL } };
}

export async function handleInteraction(interaction: Interaction): Promise<object> {
  if (interaction.type === 1) return { type: 1 }; // PING → PONG

  await ensureFeatures(); // populate the registry so feature handlers are consultable

  const discordUser = interaction.member?.user ?? interaction.user;
  if (!discordUser?.id) return ephemeralReply("Couldn't tell who you are. Try again.");

  if (interaction.type === 2) {
    const name = interaction.data?.name;
    if (name === "link") return handleLink(discordUser);
    if (name === "unlink") return handleUnlink(discordUser);
    // Discord Administrator gate — no UDM+ link required.
    if (name === "uwu") return handleUwu(interaction);
    if (name === "oxford") return handleOxford(interaction);
    if (name === "chandler-mode") return handleChandler(interaction);
    // Discord-only game — anyone in the server, no link needed.
    if (name === "jeopardy") return handleJeopardy(interaction);

    // Every other command acts as a UDM+ user.
    const user = await db.user.findUnique({ where: { discordUserId: discordUser.id } });
    if (!user) {
      return ephemeralReply(
        "Your Discord isn't linked to UDM+ yet — run `/link` and enter the code on your profile page first."
      );
    }
    // Feature-contributed commands (AI Concierge, economy, …) win; core
    // commands fall through to the switch.
    const fh = commandHandler(name);
    if (fh) return fh(user, interaction);
    const options = interaction.data?.options;
    switch (name) {
      case "events":
        return handleEvents(user);
      case "countdowns":
        return handleCountdowns();
      case "coins":
        return handleCoins(user, optValue(options, "user"));
      case "pet":
        return handlePet(user);
      case "idea":
        return handleIdeaCreate(user, optValue(options, "title"), optValue(options, "detail"));
      case "wishlist": {
        const add = options?.find((o) => o.name === "add");
        return handleWishlistAdd(
          user,
          optValue(add?.options, "url"),
          optValue(add?.options, "title"),
          interaction.token
        );
      }
      case "polls":
        return handlePolls();
      case "poll":
        return handlePollQuick(optValue(options, "question"), optValue(options, "options"));
      case "marketplace":
        return handleMarketplace();
      case "ideas":
        return handleIdeas();
      case "recipes":
        return handleRecipes();
      case "nowplaying":
        return handleNowPlaying();
      case "map":
        return handleMap();
      case "stakes":
        return handleStakes();
      case "birthdays":
        return handleBirthdays();
      case "arcade":
        return handleArcade();
      case "tanks":
        return handleTanks(user);
      default:
        return ephemeralReply("Unknown command.");
    }
  }

  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id ?? "";
    if (customId.startsWith("jeopardy:")) {
      return handleJeopardyComponent(interaction, customId.split(":").slice(1));
    }
    const user = await db.user.findUnique({ where: { discordUserId: discordUser.id } });
    if (!user) {
      return ephemeralReply(
        "Your Discord isn't linked to UDM+ yet — run `/link` and enter the code on your profile page, then try again."
      );
    }
    return handleComponent(user, interaction.data?.custom_id ?? "", interaction.data?.values);
  }

  return ephemeralReply("Nothing wired up for that yet.");
}

// --- Phase 2: feed-card buttons & selects ---
// custom_id schemes (set in feed.ts componentsFor):
//   rsvp:<going|maybe|no>:<eventId>
//   poll:vote:<pollId>      (button → ephemeral select)
//   poll:sel:<pollId>       (select submission; values carry the ballot)
//   claim:<listingId>
//   idea:up:<ideaId>
// The id is just an address — every handler refetches the entity and
// re-applies the same guards as the corresponding API route.

async function handleComponent(
  user: User,
  customId: string,
  values: string[] | undefined
): Promise<object> {
  const [head, ...rest] = customId.split(":");
  // Feature-contributed component handlers (concierge:*, drop:*, coinflip:*, …)
  // win; core buttons fall through to the switch.
  const ch = componentHandler(head);
  if (ch) return ch(user, rest, values);
  switch (head) {
    case "rsvp":
      return handleRsvp(user, rest[0], rest[1]);
    case "poll":
      return rest[0] === "vote"
        ? handlePollVoteButton(user, rest[1])
        : handlePollBallot(user, rest[1], values ?? []);
    case "claim":
      return handleClaim(user, rest[0]);
    case "idea":
      return handleIdeaUpvote(user, rest[1]);
    case "pet":
      return handlePetNudge(user);
    case "book":
      return handleBookBet(user, rest[0], rest[1]);
    default:
      return ephemeralReply("That button isn't wired to anything.");
  }
}

async function handleBookBet(user: User, outcome: string, marketId: string): Promise<object> {
  if (outcome !== "Yes" && outcome !== "No") return ephemeralReply("Unknown side.");
  if (!marketId) return ephemeralReply("That line fell off the board.");
  try {
    const [{ placeBookBet }, { BOOK_DISCORD_STAKE }] = await Promise.all([
      import("@/modules/book/place"),
      import("@/modules/book/constants"),
    ]);
    // placeBookBet re-renders the card (collage + tally) on its own, fire-and-
    // forget — so the ack still lands well inside Discord's 3s window.
    const res = await placeBookBet({
      userId: user.id,
      marketId,
      outcome,
      stake: BOOK_DISCORD_STAKE,
      refresh: false,
    });
    return ephemeralReply(
      `🎟️ You're on **${outcome}** for ${BOOK_DISCORD_STAKE} coins — pays **${res.payout.toLocaleString()}** if it hits. (${res.yesCount} yes · ${res.noCount} no)`
    );
  } catch (e) {
    return ephemeralReply(e instanceof Error ? e.message : "The ticket window jammed.");
  }
}

async function handleRsvp(user: User, status: string, eventId: string): Promise<object> {
  if (!["going", "maybe", "no"].includes(status)) return ephemeralReply("Unknown RSVP status.");
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return ephemeralReply("That event no longer exists.");

  await withOutbox(
    (tx) =>
      tx.rsvp.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        create: { eventId: event.id, userId: user.id, status: status as "going" | "maybe" | "no" },
        update: { status: status as "going" | "maybe" | "no" },
      }),
    (r) => ({
      type: "event.rsvp.changed",
      payload: { eventId: event.id, eventTitle: event.title, userId: user.id, status: r.status },
    })
  );

  // Update the channel card's RSVP tally in place (fire-and-forget; the ack
  // must land inside Discord's 3s window).
  const counts = await db.rsvp.groupBy({ by: ["status"], where: { eventId: event.id }, _count: true });
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  void editTrackedMessage("event", event.id, { status: rsvpStatus(c("going"), c("maybe"), c("no")) });

  const verb = status === "going" ? "You're in" : status === "maybe" ? "Penciled in as maybe" : "Marked as out";
  return ephemeralReply(`${verb} for **${event.title}**.`);
}

async function handlePollVoteButton(user: User, pollId: string): Promise<object> {
  const poll = await db.poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) return ephemeralReply("That poll no longer exists.");
  if (poll.closedAt) return ephemeralReply("This poll is closed.");

  // Discord string selects cap at 25 options; fine at friend-group scale.
  const options =
    poll.type === "scale"
      ? [1, 2, 3, 4, 5].map((n) => ({ label: `${"★".repeat(n)} (${n}/5)`, value: `r:${n}` }))
      : poll.options.slice(0, 25).map((o) => ({ label: o.label.slice(0, 100), value: `o:${o.id}` }));
  const multi = poll.type === "multi";

  return {
    type: 4,
    data: {
      content: `**${poll.question}**${poll.anonymous ? " · anonymous" : ""}`,
      flags: EPHEMERAL,
      components: [
        {
          type: 1,
          components: [
            {
              type: 3, // string select
              custom_id: `poll:sel:${poll.id}`,
              placeholder: multi ? "Pick one or more" : "Pick one",
              min_values: 1,
              max_values: multi ? options.length : 1,
              options,
            },
          ],
        },
      ],
    },
  };
}

async function handlePollBallot(user: User, pollId: string, values: string[]): Promise<object> {
  const poll = await db.poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) return ephemeralReply("That poll no longer exists.");
  if (poll.closedAt) return ephemeralReply("This poll closed before your ballot landed.");

  let rating: number | null = null;
  let optionIds: string[] = [];
  if (poll.type === "scale") {
    rating = Number(values[0]?.replace("r:", ""));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return ephemeralReply("That rating didn't parse — try the Vote button again.");
    }
  } else {
    const valid = new Set(poll.options.map((o) => o.id));
    optionIds = values.map((v) => v.replace("o:", "")).filter((id) => valid.has(id));
    if (optionIds.length === 0) return ephemeralReply("Those options no longer exist.");
    if (poll.type === "single") optionIds = optionIds.slice(0, 1);
  }

  // Same replace-the-ballot transaction as /api/polls/[id]/vote.
  await withOutbox(
    async (tx) => {
      await tx.pollVote.deleteMany({ where: { pollId: poll.id, userId: user.id } });
      if (rating !== null) {
        await tx.pollVote.create({ data: { pollId: poll.id, userId: user.id, rating } });
      } else {
        await tx.pollVote.createMany({
          data: optionIds.map((optionId) => ({ pollId: poll.id, userId: user.id, optionId })),
        });
      }
    },
    () => ({
      type: "poll.voted",
      payload: poll.anonymous
        ? { pollId: poll.id, question: poll.question }
        : { pollId: poll.id, question: poll.question, voterId: user.id },
    })
  );

  // Update the poll card's running tally in place (fire-and-forget).
  const voters = await db.pollVote.findMany({
    where: { pollId: poll.id },
    distinct: ["userId"],
    select: { userId: true },
  });
  void editTrackedMessage("poll", poll.id, { status: pollStatus(voters.length) });

  // Replace the ephemeral select with a confirmation.
  return {
    type: 7,
    data: { content: `Ballot cast for **${poll.question}** ✓`, components: [] },
  };
}

/**
 * /poll quick — a native Discord poll (the platform's own poll object), posted
 * publicly in the channel for fast votes. The custom button-poll (/polls) stays
 * for anonymous / sealed / scale polls. Native polls cap at 10 answers ≤55 chars.
 */
function handlePollQuick(question: string | undefined, optionsRaw: string | undefined): object {
  const q = (question ?? "").trim();
  if (!q) return ephemeralReply("Give the poll a question.");
  const answers = (optionsRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((text) => ({ poll_media: { text: text.slice(0, 55) } }));
  if (answers.length < 2) return ephemeralReply("Give at least 2 options, comma-separated.");
  // type 4 WITHOUT the ephemeral flag → the poll lands publicly in the channel.
  return {
    type: 4,
    data: {
      poll: {
        question: { text: q.slice(0, 300) },
        answers,
        duration: 24, // hours
        allow_multiselect: false,
        layout_type: 1,
      },
    },
  };
}

async function handleClaim(user: User, listingId: string): Promise<object> {
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) return ephemeralReply("That listing no longer exists.");
  if (listing.sellerId === user.id) return ephemeralReply("You can't claim your own listing.");

  // Same atomic first-come-first-served guard as /api/marketplace/[id]/claim.
  let won = false;
  await withOutbox(
    async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id: listing.id, status: "available" },
        data: { status: "claimed", claimedById: user.id, claimedAt: new Date() },
      });
      won = count > 0;
      if (!won) throw new ClaimLost();
    },
    () => ({
      type: "listing.claimed",
      payload: { listingId: listing.id, title: listing.title, claimedBy: user.id },
    })
  ).catch((err) => {
    if (!(err instanceof ClaimLost)) throw err;
  });

  if (!won) return ephemeralReply(`Too slow — **${listing.title}** is already claimed.`);

  // Winner: mark the channel card CLAIMED and disable its button in place
  // (fire-and-forget; works on the new V2 cards, no-ops on legacy ones).
  const disabledRow = {
    ...actionRow(button(2, `Claimed by ${user.displayName}`, "noop", { disabled: true })),
    id: CARD_IDS.buttons,
  };
  void editTrackedMessage("listing", listing.id, {
    status: claimedStatus(user.displayName),
    buttons: disabledRow,
  });
  return ephemeralReply(`You claimed **${listing.title}** 🎉`);
}

class ClaimLost extends Error {}

async function handleIdeaUpvote(user: User, ideaId: string): Promise<object> {
  const idea = await db.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return ephemeralReply("That idea no longer exists.");

  // Idempotent upvote (the button can't know toggle state) — same
  // upsert + count as /api/ideas/[id]/vote with voted=true.
  const voteCount = await withOutbox(
    async (tx) => {
      await tx.ideaVote.upsert({
        where: { ideaId_userId: { ideaId: idea.id, userId: user.id } },
        create: { ideaId: idea.id, userId: user.id },
        update: {},
      });
      return tx.ideaVote.count({ where: { ideaId: idea.id } });
    },
    (count) => ({
      type: "idea.vote.changed",
      payload: { ideaId: idea.id, title: idea.title, userId: user.id, voted: true, voteCount: count },
    })
  );

  return ephemeralReply(`Upvoted **${idea.title}** — ${voteCount} vote${voteCount === 1 ? "" : "s"}.`);
}

// --- Phase 3: slash commands (reads + light writes) ---

async function handleEvents(user: User): Promise<object> {
  const events = await db.event.findMany({
    where: { startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    take: 5,
    include: { rsvps: true },
  });
  if (events.length === 0) {
    return ephemeralReply("Nothing on the calendar. Someone should fix that.");
  }

  const lines = events.map((e) => {
    const going = e.rsvps.filter((r) => r.status === "going").length;
    const maybe = e.rsvps.filter((r) => r.status === "maybe").length;
    const mine = e.rsvps.find((r) => r.userId === user.id)?.status;
    const you = mine === "going" ? "you're in" : mine === "maybe" ? "you're a maybe" : mine === "no" ? "you're out" : "no RSVP yet";
    return `**${e.title}** — ${ts(e.startAt, "f")} (${ts(e.startAt, "R")})${e.location ? ` · ${e.location}` : ""}\n· ${going} going, ${maybe} maybe — ${you}`;
  });
  return ephemeralReply(`**Next up:**\n\n${lines.join("\n\n")}`);
}

async function handleCountdowns(): Promise<object> {
  const clocks = await db.countdown.findMany({
    where: { targetAt: { gte: new Date() } },
    orderBy: { targetAt: "asc" },
    take: 8,
  });
  if (clocks.length === 0) return ephemeralReply("No clocks running. `/countdowns` on the app to start one.");

  const lines = clocks.map(
    (c) => `${c.emoji ? `${c.emoji} ` : ""}**${c.title}** — lands ${ts(c.targetAt, "R")} (${ts(c.targetAt, "d")})`
  );
  return ephemeralReply(`**Counting down to:**\n\n${lines.join("\n")}`);
}

async function handleCoins(user: User, targetDiscordId: string | undefined): Promise<object> {
  let target = user;
  if (targetDiscordId && targetDiscordId !== user.discordUserId) {
    const other = await db.user.findUnique({ where: { discordUserId: targetDiscordId } });
    if (!other) return ephemeralReply("That person hasn't linked their Discord to UDM+.");
    target = other;
  }
  const recent = await db.coinTransaction.findMany({
    where: { userId: target.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { amount: true, reason: true },
  });
  const whose = target.id === user.id ? "You have" : `**${target.displayName}** has`;
  const ledger = recent.length
    ? `\n\nRecent:\n${recent.map((t) => `· ${t.amount > 0 ? "+" : ""}${t.amount} — ${t.reason}`).join("\n")}`
    : "";
  return ephemeralReply(`${whose} **${target.coins.toLocaleString("en-US")} coins**.${ledger}`);
}

async function handlePet(user: User): Promise<object> {
  // Lazy: keeps the pet engine (and its icon imports) out of the
  // interactions path unless asked for.
  const { getPetView, MOOD_LABEL, STAGE_TITLE } = await import("@/modules/pet/engine");
  const pet = await getPetView(user.id);
  const diet = pet.diet.length
    ? `\nThis week's diet: ${pet.diet.map((d) => `${d.label} ×${d.count}`).join(", ")}`
    : "";
  return {
    type: 4,
    data: {
      content: `**${pet.name}** the ${STAGE_TITLE[pet.stage]} is feeling **${MOOD_LABEL[pet.mood]}**.${diet}\n${pet.nudgesToday} pat${pet.nudgesToday === 1 ? "" : "s"} today.`,
      flags: EPHEMERAL,
      components: pet.canNudge
        ? [{ type: 1, components: [{ type: 2, style: 1, label: "Pat the pet", custom_id: "pet:nudge" }] }]
        : [],
    },
  };
}

async function handlePetNudge(user: User): Promise<object> {
  // Same one-per-day rule as /api/pet/nudge.
  const since = new Date(Date.now() - 86_400_000);
  const already = await db.petNudge.count({ where: { userId: user.id, createdAt: { gte: since } } });
  if (already > 0) return ephemeralReply("You already patted today — share the love tomorrow.");

  await withOutbox(
    (tx) => tx.petNudge.create({ data: { userId: user.id } }),
    () => ({ type: "pet.nudged", payload: { by: user.id } })
  );
  return { type: 7, data: { content: "Patted. The pet wiggles appreciatively.", components: [] } };
}

async function handleIdeaCreate(
  user: User,
  title: string | undefined,
  detail: string | undefined
): Promise<object> {
  const trimmed = title?.trim();
  if (!trimmed) return ephemeralReply("Give the idea a title.");

  // Mirrors POST /api/ideas, including the author's automatic self-vote.
  await withOutbox(
    async (tx) => {
      const idea = await tx.idea.create({
        data: { authorId: user.id, title: trimmed.slice(0, 200), detail: detail?.trim() || null },
      });
      await tx.ideaVote.create({ data: { ideaId: idea.id, userId: user.id } });
      return idea;
    },
    (i) => ({ type: "idea.created", payload: { ideaId: i.id, title: i.title, authorId: user.id } })
  );
  return ephemeralReply(`Idea pitched: **${trimmed}** — the card (with its upvote button) is on the way.`);
}

// Numbered-list reply with one action button per entry (♻️ the same
// custom_ids the feed cards use, so all clicks land in handleComponent).
// Discord caps action rows at 5 per message × 5 buttons, so lists stay ≤5.
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
function numberedButtons(
  entries: { label: string; customId: string }[],
  style = 1
): object[] {
  if (entries.length === 0) return [];
  return [
    {
      type: 1,
      components: entries.slice(0, 5).map((e, i) => ({
        type: 2,
        style,
        label: `${NUM[i]} ${e.label}`.slice(0, 80),
        custom_id: e.customId,
      })),
    },
  ];
}

function listReply(header: string, lines: string[], components: object[] = []): object {
  return {
    type: 4,
    data: {
      content: `**${header}**\n\n${lines.join("\n\n")}`.slice(0, 2000),
      flags: EPHEMERAL,
      components,
    },
  };
}

async function handlePolls(): Promise<object> {
  const polls = await db.poll.findMany({
    where: { closedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { creator: { select: { displayName: true } }, votes: { select: { userId: true } } },
  });
  if (polls.length === 0) return ephemeralReply("No open polls. `/polls` on the app to start one.");

  const lines = polls.map((p, i) => {
    const voters = new Set(p.votes.map((v) => v.userId)).size;
    return `${NUM[i]} **${p.question.slice(0, 150)}**${p.anonymous ? " · anonymous" : ""}\n· by ${p.creator.displayName} — ${voters} voted so far`;
  });
  return listReply(
    "Open polls:",
    lines,
    numberedButtons(polls.map((p) => ({ label: "Vote", customId: `poll:vote:${p.id}` })))
  );
}

async function handleMarketplace(): Promise<object> {
  const listings = await db.listing.findMany({
    where: { status: "available" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { seller: { select: { displayName: true } } },
  });
  if (listings.length === 0) return ephemeralReply("Nothing for sale right now.");

  const price = (cents: number | null) =>
    cents == null ? "free" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
  const lines = listings.map(
    (l, i) =>
      `${NUM[i]} **${l.title.slice(0, 100)}** — ${price(l.priceCents)} · ${l.delivery}\n· listed by ${l.seller.displayName} ${ts(l.createdAt, "R")}`
  );
  return listReply(
    "Up for grabs:",
    lines,
    numberedButtons(listings.map((l) => ({ label: "Claim", customId: `claim:${l.id}` })), 3)
  );
}

async function handleIdeas(): Promise<object> {
  const ideas = await db.idea.findMany({
    where: { status: "open" },
    include: {
      author: { select: { displayName: true } },
      votes: { select: { userId: true } },
    },
  });
  if (ideas.length === 0) return ephemeralReply("The suggestion box is empty — `/idea` to fix that.");

  const top = ideas.sort((a, b) => b.votes.length - a.votes.length).slice(0, 5);
  const lines = top.map(
    (idea, i) =>
      `${NUM[i]} **${idea.title.slice(0, 150)}** — ${idea.votes.length} vote${idea.votes.length === 1 ? "" : "s"}\n· by ${idea.author.displayName}`
  );
  return listReply(
    "Top open ideas:",
    lines,
    numberedButtons(top.map((idea) => ({ label: "▲", customId: `idea:up:${idea.id}` })))
  );
}

async function handleRecipes(): Promise<object> {
  const recipes = await db.recipe.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { author: { select: { displayName: true } } },
  });
  if (recipes.length === 0) return ephemeralReply("The cookbook is empty.");

  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const lines = recipes.map((r) => {
    const title = base ? `[${r.title.slice(0, 100)}](${base}/cookbook/${r.id})` : `**${r.title.slice(0, 100)}**`;
    return `· ${title} — by ${r.author.displayName} ${ts(r.createdAt, "R")}`;
  });
  return listReply("Latest from the cookbook:", [lines.join("\n")]);
}

async function handleNowPlaying(): Promise<object> {
  const items = await db.nowPlayingItem.findMany({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: { user: { select: { displayName: true } } },
  });
  if (items.length === 0) return ephemeralReply("Nobody's watching/reading/playing anything. Suspicious.");

  const icon = { show: "📺", movie: "🎬", book: "📚" } as const;
  const lines = items.map(
    (n) =>
      `${icon[n.mediaType]} **${n.title.slice(0, 100)}**${n.releaseYear ? ` (${n.releaseYear})` : ""} — ${n.user.displayName}`
  );
  return listReply("Currently consuming:", [lines.join("\n")]);
}

async function handleMap(): Promise<object> {
  const pins = await db.mapPin.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { creator: { select: { displayName: true } } },
  });
  if (pins.length === 0) return ephemeralReply("The atlas is blank — drop a pin in the app.");

  const lines = pins.map(
    (p) =>
      `📍 **${p.name.slice(0, 100)}** (${p.category}) — pinned by ${p.creator.displayName}${p.note ? `\n· ${p.note.slice(0, 120)}` : ""}`
  );
  return listReply("Fresh pins on the map:", lines);
}

async function handleStakes(): Promise<object> {
  const claims = await db.claim.findMany({
    where: { resolvedAt: null },
    orderBy: { resolvesAt: "asc" },
    take: 5,
    include: {
      creator: { select: { displayName: true } },
      counterparty: { select: { displayName: true } },
    },
  });
  if (claims.length === 0) return ephemeralReply("No open bets. Cowards.");

  const lines = claims.map((c) => {
    const text = c.hidden ? "*(sealed until it resolves)*" : `**${c.text.slice(0, 150)}**`;
    const vs = c.counterparty ? ` — vs ${c.counterparty.displayName}` : "";
    const stake = c.stake ? `\n· stake: ${c.stake.slice(0, 100)}` : "";
    return `🎯 ${text}\n· ${c.creator.displayName}${vs} · resolves ${ts(c.resolvesAt, "R")}${stake}`;
  });
  return listReply("Open stakes:", lines);
}

async function handleBirthdays(): Promise<object> {
  const cards = await db.contactCard.findMany({
    where: { birthday: { not: null } },
    include: { user: { select: { displayName: true } } },
  });
  const now = new Date();
  const upcoming = cards
    .map((c) => {
      const b = c.birthday!;
      const next = new Date(now.getFullYear(), b.getUTCMonth(), b.getUTCDate());
      if (next < now) next.setFullYear(next.getFullYear() + 1);
      return { name: c.user.displayName, next };
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 8);
  if (upcoming.length === 0) return ephemeralReply("No birthdays on file — add yours on /me.");

  const lines = upcoming.map(
    (b) =>
      `🎂 **${b.name}** — ${b.next.toLocaleDateString("en-US", { month: "long", day: "numeric" })} (${ts(b.next, "R")})`
  );
  return listReply("Upcoming birthdays:", lines);
}

async function handleArcade(): Promise<object> {
  const scores = await db.arcadeScore.findMany({
    orderBy: { score: "desc" },
    include: { user: { select: { id: true, displayName: true } } },
  });
  if (scores.length === 0) return ephemeralReply("No arcade scores yet. The machines sit silent.");

  // Personal best per player per game, top 3 shown.
  const games = [...new Set(scores.map((s) => s.game))];
  const medals = ["🥇", "🥈", "🥉"];
  const sections = games.map((game) => {
    const best = new Map<string, { name: string; score: number }>();
    for (const s of scores.filter((s) => s.game === game)) {
      if (!best.has(s.user.id)) best.set(s.user.id, { name: s.user.displayName, score: s.score });
    }
    const top = [...best.values()].slice(0, 3);
    return `**${game}**\n${top.map((t, i) => `${medals[i]} ${t.name} — ${t.score.toLocaleString("en-US")}`).join("\n")}`;
  });
  return listReply("Arcade leaderboards:", sections);
}

async function handleTanks(user: User): Promise<object> {
  const games = await db.tanksGame.findMany({
    where: { status: "active", OR: [{ challengerId: user.id }, { opponentId: user.id }] },
    orderBy: { updatedAt: "desc" },
    include: {
      challenger: { select: { id: true, displayName: true } },
      opponent: { select: { id: true, displayName: true } },
    },
  });
  if (games.length === 0) {
    return ephemeralReply("No active duels. Challenge someone from the app's Tanks lobby.");
  }

  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const lines = games.map((g) => {
    const foe = g.challengerId === user.id ? g.opponent : g.challenger;
    const yourHp = g.challengerId === user.id ? g.challengerHp : g.opponentHp;
    const foeHp = g.challengerId === user.id ? g.opponentHp : g.challengerHp;
    const turn = g.currentPlayerId === user.id ? "**YOUR TURN**" : `waiting on ${foe.displayName}`;
    const link = base ? ` · [fire](${base}/tanks/${g.id})` : "";
    return `💥 vs **${foe.displayName}** — you ${yourHp}hp / them ${foeHp}hp · turn ${g.turnCount + 1} · ${turn}${link}`;
  });
  return listReply("Your duels:", lines);
}

async function handleWishlistAdd(
  user: User,
  url: string | undefined,
  title: string | undefined,
  interactionToken: string | undefined
): Promise<object> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return ephemeralReply("Give me a full http(s) link.");
  }

  // The OG scrape can take seconds — past Discord's 3s ack window. Ack
  // with a deferred ephemeral response (type 5), do the work, then edit
  // the original via the interaction-token webhook. Railway is one
  // long-lived process, so post-response work is safe here.
  const { appId } = botConfig();
  const finish = async () => {
    let content: string;
    try {
      const { fetchLinkPreview } = await import("@/modules/wishlist/linkPreview");
      const preview = await fetchLinkPreview(url).catch(() => null);
      const finalTitle =
        title?.trim() || preview?.title || new URL(url).hostname.replace(/^www\./, "");
      const item = await withOutbox(
        (tx) =>
          tx.wishlistItem.create({
            data: {
              userId: user.id,
              title: finalTitle.slice(0, 200),
              url,
              imageUrl: preview?.imageUrl ?? null,
              siteName: preview?.siteName ?? null,
            },
          }),
        (i) => ({ type: "wishlist.added", payload: { itemId: i.id, userId: user.id, title: i.title } })
      );
      content = `Wishlisted: **${item.title}** ✓`;
    } catch (err) {
      console.error("[discord] wishlist add failed:", err);
      content = "Couldn't add that — try it from the app.";
    }
    if (appId && interactionToken) {
      await fetch(`${DISCORD_API}/webhooks/${appId}/${interactionToken}/messages/@original`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).catch((err) => console.error("[discord] follow-up failed:", err));
    }
  };
  void finish();

  return { type: 5, data: { flags: EPHEMERAL } }; // deferred ephemeral
}

async function handleLink(discordUser: DiscordUser): Promise<object> {
  const existing = await db.user.findUnique({
    where: { discordUserId: discordUser.id },
    select: { displayName: true },
  });
  if (existing) {
    return ephemeralReply(
      `This Discord account is already linked to **${existing.displayName}** on UDM+. Use \`/unlink\` first if that's wrong.`
    );
  }

  const code = mintCode();
  const username = discordUser.global_name ?? discordUser.username ?? "unknown";
  await db.$transaction([
    // One live code per Discord account; re-running /link replaces it.
    db.discordLinkCode.deleteMany({ where: { discordUserId: discordUser.id } }),
    db.discordLinkCode.create({
      data: {
        code,
        discordUserId: discordUser.id,
        discordUsername: username,
        expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      },
    }),
  ]);

  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  return ephemeralReply(
    `Your link code is **\`${code}\`** — enter it on your profile page${base ? ` (${base}/me)` : " (the “You” tab)"} within 10 minutes. Only you can see this message.`
  );
}

async function handleUnlink(discordUser: DiscordUser): Promise<object> {
  const user = await db.user.findUnique({
    where: { discordUserId: discordUser.id },
    select: { id: true, displayName: true },
  });
  if (!user) return ephemeralReply("This Discord account isn't linked to anyone on UDM+.");

  await db.user.update({ where: { id: user.id }, data: { discordUserId: null } });
  return ephemeralReply(`Unlinked from **${user.displayName}**. Run \`/link\` any time to reconnect.`);
}
