import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { editTrackedMessage } from "@/lib/discord/messageState";
import { actionRow, button, CARD_IDS } from "@/lib/discord/components";
import { rsvpStatus, claimedStatus, pollStatus } from "@/lib/discord/cardStatus";
import { pollInput } from "@/modules/polls/schema";
import { ideaInput } from "@/modules/ideas/schema";
import { eventInput } from "@/modules/events/schema";
import { recipeInput } from "@/modules/cookbook/schema";
import { countdownInput } from "@/modules/countdowns/schema";
import { listingInput } from "@/modules/marketplace/schema";
import { wishlistItemInput } from "@/modules/wishlist/schema";

/**
 * The UDM assistant's "tools": create-content and take-action functions, each
 * acting AS the given user. They deliberately mirror the existing API routes /
 * interaction handlers — same zod schema, same withOutbox event/payload — so a
 * Discord-initiated create or action fires the identical coins + feed card as
 * the web app. (The outbox event type+payload is the stable contract; this is a
 * thin reuse layer, not new economy logic.)
 *
 * Each runner returns a short, user-facing confirmation string. Bad model args
 * make the underlying zod `.parse` throw; the assistant dispatcher catches that
 * and replies gracefully, so a misparse can never write a malformed row.
 */

type Args = Record<string, unknown>;
type Runner = (userId: string, args: Args) => Promise<string>;

class ClaimLost extends Error {}

const opt = <T>(v: T | undefined | null): T | null => (v == null ? null : v);

// ── Create tools ─────────────────────────────────────────────────────────────

const createPoll: Runner = async (userId, args) => {
  const data = pollInput.parse({
    question: args.question,
    type: args.type ?? "single",
    anonymous: args.anonymous ?? false,
    sensitive: false,
    options: args.options ?? [],
  });
  const poll = await withOutbox(
    (tx) =>
      tx.poll.create({
        data: {
          creatorId: userId,
          question: data.question,
          type: data.type,
          anonymous: data.anonymous,
          sensitive: data.sensitive,
          revealThreshold: data.revealThreshold ?? null,
          options:
            data.type === "scale"
              ? undefined
              : { create: data.options.map((label, order) => ({ label, order })) },
        },
      }),
    (p) => ({
      type: "poll.created",
      payload: { pollId: p.id, question: p.question, type: p.type, createdBy: userId },
    })
  );
  return `📊 Posted your poll: **${poll.question}** — the card lands in the channel shortly.`;
};

const createIdea: Runner = async (userId, args) => {
  const data = ideaInput.parse({ title: args.title, detail: opt(args.detail) });
  const idea = await withOutbox(
    async (tx) => {
      const created = await tx.idea.create({
        data: { authorId: userId, title: data.title, detail: data.detail ?? null },
      });
      await tx.ideaVote.create({ data: { ideaId: created.id, userId } });
      return created;
    },
    (i) => ({ type: "idea.created", payload: { ideaId: i.id, title: i.title, authorId: userId } })
  );
  return `💡 Dropped it in the suggestion box: **${idea.title}**.`;
};

const createEvent: Runner = async (userId, args) => {
  const data = eventInput.parse({
    title: args.title,
    description: opt(args.description),
    location: opt(args.location),
    startAt: args.startAt,
    endAt: opt(args.endAt),
  });
  const event = await withOutbox(
    (tx) =>
      tx.event.create({
        data: {
          creatorId: userId,
          title: data.title,
          description: data.description ?? null,
          location: data.location ?? null,
          startAt: data.startAt,
          endAt: data.endAt ?? null,
        },
      }),
    (e) => ({
      type: "event.created",
      payload: { eventId: e.id, title: e.title, startAt: e.startAt.toISOString(), creatorId: userId },
    })
  );
  return `📅 Created **${event.title}** — the card (with RSVP buttons) lands in the channel shortly.`;
};

const createRecipe: Runner = async (userId, args) => {
  const data = recipeInput.parse({ title: args.title, body: args.body, imageKey: opt(args.imageKey) });
  const recipe = await withOutbox(
    (tx) =>
      tx.recipe.create({
        data: { authorId: userId, title: data.title, body: data.body, imageKey: data.imageKey ?? null },
      }),
    (r) => ({ type: "recipe.created", payload: { recipeId: r.id, title: r.title, authorId: userId } })
  );
  return `🍳 Added to the cookbook: **${recipe.title}**.`;
};

const createCountdown: Runner = async (userId, args) => {
  const data = countdownInput.parse({
    title: args.title,
    emoji: opt(args.emoji),
    targetAt: args.targetAt,
    link: opt(args.link),
  });
  const countdown = await withOutbox(
    (tx) =>
      tx.countdown.create({
        data: {
          creatorId: userId,
          title: data.title,
          emoji: data.emoji ?? null,
          targetAt: data.targetAt,
          link: data.link ?? null,
        },
      }),
    (c) => ({
      type: "countdown.created",
      payload: {
        countdownId: c.id,
        title: c.title,
        emoji: c.emoji,
        targetAt: c.targetAt.toISOString(),
        creatorId: userId,
      },
    })
  );
  return `⏳ Clock started: **${countdown.title}**.`;
};

const createListing: Runner = async (userId, args) => {
  const data = listingInput.parse({
    title: args.title,
    description: opt(args.description),
    priceCents: opt(args.priceCents),
    delivery: args.delivery ?? "either",
    imageKey: null,
  });
  const listing = await withOutbox(
    (tx) =>
      tx.listing.create({
        data: {
          sellerId: userId,
          title: data.title,
          description: data.description ?? null,
          priceCents: data.priceCents ?? null,
          delivery: data.delivery,
          imageKey: data.imageKey ?? null,
        },
      }),
    (l) => ({
      type: "listing.created",
      payload: { listingId: l.id, title: l.title, priceCents: l.priceCents, sellerId: userId },
    })
  );
  return `🏷️ Listed for sale: **${listing.title}**.`;
};

const createWishlist: Runner = async (userId, args) => {
  const data = wishlistItemInput.parse({
    title: args.title,
    url: opt(args.url),
    imageUrl: opt(args.imageUrl),
    siteName: opt(args.siteName),
    note: opt(args.note),
  });
  const item = await withOutbox(
    (tx) =>
      tx.wishlistItem.create({
        data: {
          userId,
          title: data.title,
          url: data.url ?? null,
          imageUrl: data.imageUrl ?? null,
          siteName: data.siteName ?? null,
          note: data.note ?? null,
        },
      }),
    (i) => ({ type: "wishlist.added", payload: { itemId: i.id, userId, title: i.title } })
  );
  return `🎁 Added to your wishlist: **${item.title}**.`;
};

// ── Action tools (refetch the entity + re-apply guards, like the buttons) ─────

const rsvp: Runner = async (userId, args) => {
  const eventId = typeof args.eventId === "string" ? args.eventId : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  if (!eventId || !status || !["going", "maybe", "no"].includes(status)) {
    return "Tell me which event, and whether you're going / maybe / out.";
  }
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return "That event isn't on the calendar anymore.";
  await withOutbox(
    (tx) =>
      tx.rsvp.upsert({
        where: { eventId_userId: { eventId: event.id, userId } },
        create: { eventId: event.id, userId, status: status as "going" | "maybe" | "no" },
        update: { status: status as "going" | "maybe" | "no" },
      }),
    (r) => ({
      type: "event.rsvp.changed",
      payload: { eventId: event.id, eventTitle: event.title, userId, status: r.status },
    })
  );
  const counts = await db.rsvp.groupBy({ by: ["status"], where: { eventId: event.id }, _count: true });
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  void editTrackedMessage("event", event.id, { status: rsvpStatus(c("going"), c("maybe"), c("no")) });
  const verb = status === "going" ? "You're in" : status === "maybe" ? "Penciled you in as maybe" : "Marked you out";
  return `${verb} for **${event.title}**.`;
};

const pollVote: Runner = async (userId, args) => {
  const pollId = typeof args.pollId === "string" ? args.pollId : undefined;
  if (!pollId) return "Which poll do you want to vote in?";
  const optionIds = Array.isArray(args.optionIds) ? (args.optionIds as unknown[]).map(String) : [];
  const poll = await db.poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) return "That poll's gone.";
  if (poll.closedAt) return "That poll's already closed.";
  if (poll.type === "scale") return "That's a star-rating poll — rate it in the app.";
  const valid = new Set(poll.options.map((o) => o.id));
  let ids = optionIds.filter((id) => valid.has(id));
  if (ids.length === 0) return "Tell me which option to pick.";
  if (poll.type === "single") ids = ids.slice(0, 1);
  await withOutbox(
    async (tx) => {
      await tx.pollVote.deleteMany({ where: { pollId: poll.id, userId } });
      await tx.pollVote.createMany({ data: ids.map((optionId) => ({ pollId: poll.id, userId, optionId })) });
    },
    () => ({
      type: "poll.voted",
      payload: poll.anonymous
        ? { pollId: poll.id, question: poll.question }
        : { pollId: poll.id, question: poll.question, voterId: userId },
    })
  );
  const voters = await db.pollVote.findMany({
    where: { pollId: poll.id },
    distinct: ["userId"],
    select: { userId: true },
  });
  void editTrackedMessage("poll", poll.id, { status: pollStatus(voters.length) });
  const picked = poll.options.filter((o) => ids.includes(o.id)).map((o) => o.label).join(", ");
  return `🗳️ Voted for **${picked}** in "${poll.question}".`;
};

const claimListing: Runner = async (userId, args) => {
  const listingId = typeof args.listingId === "string" ? args.listingId : undefined;
  if (!listingId) return "Which listing?";
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) return "That listing's gone.";
  if (listing.sellerId === userId) return "You can't claim your own listing.";
  let won = false;
  await withOutbox(
    async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id: listing.id, status: "available" },
        data: { status: "claimed", claimedById: userId, claimedAt: new Date() },
      });
      won = count > 0;
      if (!won) throw new ClaimLost();
    },
    () => ({
      type: "listing.claimed",
      payload: { listingId: listing.id, title: listing.title, claimedBy: userId },
    })
  ).catch((e) => {
    if (!(e instanceof ClaimLost)) throw e;
  });
  if (!won) return `Too slow — **${listing.title}** is already claimed.`;
  const me = await db.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  const name = me?.displayName ?? "someone";
  const disabledRow = {
    ...actionRow(button(2, `Claimed by ${name}`, "noop", { disabled: true })),
    id: CARD_IDS.buttons,
  };
  void editTrackedMessage("listing", listing.id, { status: claimedStatus(name), buttons: disabledRow });
  return `🏷️ You claimed **${listing.title}**.`;
};

const ideaUpvote: Runner = async (userId, args) => {
  const ideaId = typeof args.ideaId === "string" ? args.ideaId : undefined;
  if (!ideaId) return "Which idea?";
  const idea = await db.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return "That idea's gone.";
  const voteCount = await withOutbox(
    async (tx) => {
      await tx.ideaVote.upsert({
        where: { ideaId_userId: { ideaId: idea.id, userId } },
        create: { ideaId: idea.id, userId },
        update: {},
      });
      return tx.ideaVote.count({ where: { ideaId: idea.id } });
    },
    (count) => ({
      type: "idea.vote.changed",
      payload: { ideaId: idea.id, title: idea.title, userId, voted: true, voteCount: count },
    })
  );
  return `▲ Upvoted **${idea.title}** — ${voteCount} vote${voteCount === 1 ? "" : "s"}.`;
};

/** tool name -> runner. `answer` is handled in the assistant (no side effects). */
export const TOOL_RUNNERS: Record<string, Runner> = {
  create_poll: createPoll,
  create_idea: createIdea,
  create_event: createEvent,
  create_recipe: createRecipe,
  create_countdown: createCountdown,
  create_listing: createListing,
  create_wishlist: createWishlist,
  rsvp,
  poll_vote: pollVote,
  claim_listing: claimListing,
  idea_upvote: ideaUpvote,
};

export const TOOL_NAMES = ["answer", ...Object.keys(TOOL_RUNNERS)] as const;
