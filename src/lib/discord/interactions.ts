import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
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
  data?: { name?: string; custom_id?: string; values?: string[] };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
};
type DiscordUser = { id: string; username?: string; global_name?: string | null };

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
    switch (interaction.data?.name) {
      case "link":
        return handleLink(discordUser);
      case "unlink":
        return handleUnlink(discordUser);
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
