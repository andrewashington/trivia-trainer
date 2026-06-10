import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { DISCORD_API, botConfig } from "@/lib/discord/bot";
import { withOutbox } from "@/lib/outbox";

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

type Interaction = {
  type: number;
  token?: string;
  data?: { name?: string; custom_id?: string; values?: string[]; options?: CommandOption[] };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
};
type CommandOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: CommandOption[];
};
type DiscordUser = { id: string; username?: string; global_name?: string | null };

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

  const discordUser = interaction.member?.user ?? interaction.user;
  if (!discordUser?.id) return ephemeralReply("Couldn't tell who you are. Try again.");

  if (interaction.type === 2) {
    const name = interaction.data?.name;
    if (name === "link") return handleLink(discordUser);
    if (name === "unlink") return handleUnlink(discordUser);

    // Every other command acts as a UDM+ user.
    const user = await db.user.findUnique({ where: { discordUserId: discordUser.id } });
    if (!user) {
      return ephemeralReply(
        "Your Discord isn't linked to UDM+ yet — run `/link` and enter the code on your profile page first."
      );
    }
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
      default:
        return ephemeralReply("Unknown command.");
    }
  }

  if (interaction.type === 3) {
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
    default:
      return ephemeralReply("That button isn't wired to anything.");
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

  // Replace the ephemeral select with a confirmation.
  return {
    type: 7,
    data: { content: `Ballot cast for **${poll.question}** ✓`, components: [] },
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

  // Winner: disable the button on the card itself so the channel sees it.
  return {
    type: 7,
    data: {
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 2, label: `Claimed by ${user.displayName}`, custom_id: "noop", disabled: true },
          ],
        },
      ],
    },
  };
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
