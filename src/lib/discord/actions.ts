import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { creditWinnings, spendCoins } from "@/modules/arcade/bank";
import { getGameKnobsCached } from "@/lib/knobs";
import { editTrackedMessage } from "@/lib/discord/messageState";
import { actionRow, button, CARD_IDS } from "@/lib/discord/components";
import { rsvpStatus, claimedStatus, pollStatus } from "@/lib/discord/cardStatus";
import { pollInput } from "@/modules/polls/schema";
import { ideaInput } from "@/modules/ideas/schema";
import { eventInput } from "@/modules/events/schema";
import { recipeInput } from "@/modules/cookbook/schema";
import { countdownInput } from "@/modules/countdowns/schema";
import { listingInput } from "@/modules/marketplace/schema";
import { wishlistItemInput, coolFindInput } from "@/modules/wishlist/schema";
import { promptInput } from "@/modules/reveal/schema";
import { claimInput } from "@/modules/stakes/schema";
import { tierListInput } from "@/modules/tiers/schema";
import { nowPlayingInput } from "@/modules/nowplaying/schema";
import { mapPinInput } from "@/modules/map/schema";
import { challengeInput } from "@/modules/challenges/schema";

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

const createCoolFind: Runner = async (userId, args) => {
  const data = coolFindInput.parse({
    title: args.title,
    url: args.url,
    category: args.category ?? "interesting",
    note: opt(args.note),
    imageUrl: opt(args.imageUrl),
    siteName: opt(args.siteName),
  });
  // Cool Finds intentionally has no outbox/feed event (matches its API route).
  const find = await db.coolFind.create({
    data: {
      userId,
      title: data.title,
      url: data.url,
      category: data.category,
      note: data.note ?? null,
      imageUrl: data.imageUrl ?? null,
      siteName: data.siteName ?? null,
    },
  });
  return `🔗 Filed under cool finds (${find.category}): **${find.title}**.`;
};

const createReveal: Runner = async (userId, args) => {
  const data = promptInput.parse({
    type: args.type,
    title: args.title,
    items: args.items,
    sealedBody: opt(args.sealedBody),
    unlockAt: opt(args.unlockAt),
    deadline: opt(args.deadline),
    unlockVotesNeeded: opt(args.unlockVotesNeeded),
  });
  const prompt = await withOutbox(
    async (tx) => {
      const p = await tx.revealPrompt.create({
        data: {
          creatorId: userId,
          type: data.type,
          title: data.title,
          items: data.type === "rank" ? data.items : undefined,
          deadline: data.type === "sealed" ? null : (data.deadline ?? null),
          unlockAt: data.type === "sealed" ? data.unlockAt : null,
          unlockVotesNeeded: data.type === "sealed" ? (data.unlockVotesNeeded ?? null) : null,
        },
      });
      if (data.type === "sealed") {
        await tx.revealSubmission.create({
          data: { promptId: p.id, userId, payload: { body: data.sealedBody! } },
        });
      }
      return p;
    },
    (p) => ({
      type: "reveal.created",
      payload: { promptId: p.id, title: p.title, type: p.type, createdBy: userId },
    })
  );
  return `🎭 Reveal started: **${prompt.title}**.`;
};

const createStake: Runner = async (userId, args) => {
  // Forgiving date: the model often omits or fumbles resolvesAt — default to a
  // week out rather than throwing.
  const provided = args.resolvesAt ? new Date(args.resolvesAt as string) : null;
  const resolvesAt =
    provided && !Number.isNaN(provided.getTime()) && provided > new Date()
      ? provided
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // Hidden predictions are solo by rule — drop any counterparty/stake so the
  // "sealed prediction" path can't fail the bets-can't-be-hidden check.
  const hidden = args.hidden === true;
  const data = claimInput.parse({
    text: args.text,
    resolvesAt,
    hidden,
    counterpartyId: hidden ? null : opt(args.counterpartyId),
    stake: hidden ? null : opt(args.stake),
  });
  if (data.counterpartyId === userId) throw new Error("You can't bet against yourself.");
  const claim = await withOutbox(
    (tx) =>
      tx.claim.create({
        data: {
          creatorId: userId,
          text: data.text,
          resolvesAt: data.resolvesAt,
          hidden: data.hidden,
          counterpartyId: data.counterpartyId ?? null,
          stake: data.stake ?? null,
        },
      }),
    (c) => ({
      type: "claim.created",
      payload: {
        claimId: c.id,
        text: c.hidden ? null : c.text,
        hidden: c.hidden,
        resolvesAt: c.resolvesAt.toISOString(),
        creatorId: userId,
        counterpartyId: c.counterpartyId,
        stake: c.stake,
      },
    })
  );
  return data.hidden
    ? `🤐 Sealed prediction locked in (revealed when it resolves).`
    : `🎯 Stake called: **${claim.text}**.`;
};

const createTierList: Runner = async (userId, args) => {
  const data = tierListInput.parse({
    title: args.title,
    items: args.items,
    description: opt(args.description),
    sensitive: args.sensitive ?? false,
  });
  // De-dupe labels case-insensitively, mirroring the API route.
  const seen = new Set<string>();
  const labels = data.items.filter((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const list = await withOutbox(
    (tx) =>
      tx.tierList.create({
        data: {
          creatorId: userId,
          title: data.title,
          description: data.description ?? null,
          sensitive: data.sensitive,
          items: { create: labels.map((label, i) => ({ label, position: i })) },
        },
      }),
    (l) => ({
      type: "tierlist.created",
      payload: { listId: l.id, title: l.title, creatorId: userId, itemCount: labels.length },
    })
  );
  return `🏆 Tier list ready to rank: **${list.title}** (${labels.length} items).`;
};

const createNowPlaying: Runner = async (userId, args) => {
  const data = nowPlayingInput.parse({
    mediaType: args.mediaType,
    title: args.title,
    note: opt(args.note),
  });
  const item = await withOutbox(
    (tx) =>
      tx.nowPlayingItem.create({
        data: { userId, mediaType: data.mediaType, title: data.title, note: data.note ?? null },
      }),
    (i) => ({
      type: "nowplaying.updated",
      payload: { action: "added", itemId: i.id, userId, mediaType: i.mediaType, title: i.title },
    })
  );
  const verb = item.mediaType === "book" ? "reading" : "watching";
  return `📺 Now ${verb}: **${item.title}**.`;
};

const createMapPin: Runner = async (userId, args) => {
  let lat = typeof args.lat === "number" ? args.lat : undefined;
  let lng = typeof args.lng === "number" ? args.lng : undefined;
  const address = typeof args.address === "string" && args.address.trim() ? args.address.trim() : undefined;

  // Geocode via Nominatim when coordinates aren't provided.
  if ((lat === undefined || lng === undefined) && address) {
    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "User-Agent": "UDM+ Discord bot (udmplus.app)" }, signal: AbortSignal.timeout(6000) }
    ).catch(() => null);
    const places = geo?.ok ? (await geo.json() as { lat: string; lon: string; display_name: string }[]) : [];
    if (!places.length) return `Couldn't find "${address}" on the map — try a more specific address.`;
    lat = parseFloat(places[0].lat);
    lng = parseFloat(places[0].lon);
  }

  const data = mapPinInput.parse({
    name: args.name,
    category: args.category,
    lat,
    lng,
    address: opt(address ?? args.address),
    note: opt(args.note),
  });
  const pin = await withOutbox(
    (tx) =>
      tx.mapPin.create({
        data: {
          creatorId: userId,
          name: data.name,
          category: data.category,
          lat: data.lat,
          lng: data.lng,
          address: data.address ?? null,
          note: data.note ?? null,
        },
      }),
    (p) => ({
      type: "map.pin.added",
      payload: { pinId: p.id, name: p.name, category: p.category, addedBy: userId },
    })
  );
  return `📍 Pin dropped: **${pin.name}**.`;
};

const fetchUrl: Runner = async (_userId, args) => {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!url.startsWith("http")) return "Need a full http/https URL.";
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "UDM+ Discord bot (udmplus.app)" },
  }).catch((err: Error) => { throw new Error(`Fetch failed: ${err.message}`); });
  if (!res.ok) return `Got HTTP ${res.status} from that URL.`;
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 3500) || "Page loaded but no readable text found.";
};

const lookupMedia: Runner = async (_userId, args) => {
  const key = process.env.TMDB_API_KEY;
  if (!key) return "TMDB not configured.";
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return "Need a title to search.";
  const mediaType = args.type === "tv" ? "tv" : "movie";
  const isV4 = key.includes(".");

  const url = new URL(`https://api.themoviedb.org/3/search/${mediaType}`);
  url.searchParams.set("query", title);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", "1");
  if (!isV4) url.searchParams.set("api_key", key);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json", ...(isV4 ? { Authorization: `Bearer ${key}` } : {}) },
  }).catch((err: Error) => { throw new Error(`TMDB fetch failed: ${err.message}`); });
  if (!res.ok) return `TMDB returned ${res.status}.`;

  const raw = (await res.json()) as {
    results?: {
      id: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      overview?: string;
      vote_average?: number;
      vote_count?: number;
    }[];
  };

  const results = (raw.results ?? []).slice(0, 4);
  if (!results.length) return `Nothing found for "${title}" on TMDB.`;

  return results.map((r) => {
    const name = (mediaType === "movie" ? r.title : r.name) ?? "Untitled";
    const date = r.release_date || r.first_air_date || "";
    const year = date.slice(0, 4);
    const rating = r.vote_average ? `${r.vote_average.toFixed(1)}/10 (${r.vote_count?.toLocaleString()} votes)` : "unrated";
    const overview = r.overview?.slice(0, 200) ?? "No description.";
    return `**${name}** (${year || "?"}) — ${rating}\n${overview}`;
  }).join("\n\n");
};

/**
 * The bot's coin power: grant (+) or dock (−) coins from a member, capped at a
 * shared daily budget (knob discord.botCoinDailyBudget, default 1000) summed
 * across everyone the bot touches. Reuses the real ledger helpers, so it shows
 * up in coin history; punishment floors at the target's balance (never negative).
 */
const adjustCoins: Runner = async (askerId, args) => {
  const targetId = typeof args.targetUserId === "string" && args.targetUserId ? args.targetUserId : askerId;
  const requested = Math.round(Number(args.amount));
  if (!Number.isFinite(requested) || requested === 0) return "Give me a non-zero coin amount.";
  const note = (typeof args.reason === "string" ? args.reason : "").trim().slice(0, 160) || "the bot has spoken";

  const knobs = await getGameKnobsCached("discord");
  const budget = Math.max(0, Number(knobs.botCoinDailyBudget ?? 1000));

  try {
    return await db.$transaction(async (tx) => {
      // Shared daily budget: gross coins the bot has moved (either direction) in 24h.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await tx.coinTransaction.findMany({
        where: { reason: { in: ["discord.ai.grant", "discord.ai.punish"] }, createdAt: { gte: since } },
        select: { amount: true },
      });
      const usedGross = recent.reduce((s, t) => s + Math.abs(t.amount), 0);
      const remaining = budget - usedGross;
      if (remaining <= 0) return `I've spent my ${budget}-coin daily allowance — the treasury's dry till tomorrow.`;

      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { id: true, displayName: true, coins: true },
      });
      if (!target) return "I can't find that member to adjust.";

      const sign = requested > 0 ? 1 : -1;
      const magnitude = Math.min(Math.abs(requested), remaining);

      if (sign > 0) {
        await creditWinnings(tx, target.id, magnitude, "discord.ai.grant", note, { by: "discord-ai" });
        const after = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: { coins: true } });
        return `🪙 Granted **${magnitude}** coins to ${target.displayName} (${note}). They're at ${after.coins}.`;
      }
      // Punish: only take what they have (no negative balances).
      const take = Math.min(magnitude, target.coins);
      if (take <= 0) return `${target.displayName} is already broke — nothing to dock.`;
      await spendCoins(tx, target.id, take, "discord.ai.punish", note, "broke", { by: "discord-ai" });
      const after = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: { coins: true } });
      return `💸 Docked **${take}** coins from ${target.displayName} (${note}). They're down to ${after.coins}.`;
    });
  } catch (e) {
    return `Couldn't adjust coins: ${e instanceof Error ? e.message : "something went wrong"}.`;
  }
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

const createChallenge: Runner = async (userId, args) => {
  const deadlineDays = Math.max(1, Math.round(Number(args.deadlineDays) || 7));
  const deadline = new Date(Date.now() + deadlineDays * 864e5).toISOString();
  const data = challengeInput.parse({
    title: args.title,
    description: opt(args.description),
    deadline,
  });
  const challenge = await withOutbox(
    (tx) =>
      tx.challenge.create({
        data: {
          creatorId: userId,
          title: data.title,
          description: data.description ?? null,
          deadline: data.deadline ? new Date(data.deadline) : null,
        },
      }),
    (c) => ({
      type: "challenge.created",
      payload: { challengeId: c.id, title: c.title, creatorId: userId, deadline: c.deadline?.toISOString() ?? null },
    })
  );
  return `🎯 Challenge posted: **${challenge.title}** — ${deadlineDays} day${deadlineDays === 1 ? "" : "s"} to prove yourselves.`;
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
  create_coolfind: createCoolFind,
  create_reveal: createReveal,
  create_stake: createStake,
  create_tierlist: createTierList,
  create_nowplaying: createNowPlaying,
  create_map_pin: createMapPin,
  create_challenge: createChallenge,
  adjust_coins: adjustCoins,
  rsvp,
  poll_vote: pollVote,
  claim_listing: claimListing,
  idea_upvote: ideaUpvote,
};

export const TOOL_NAMES = ["answer", ...Object.keys(TOOL_RUNNERS)] as const;
