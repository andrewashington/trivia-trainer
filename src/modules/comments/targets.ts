import { db } from "@/lib/db";
import type { CommentTargetType } from "@/modules/comments/schema";

/**
 * Per-target-type owner lookups. Each returns the owning userId or null
 * if the target doesn't exist. Used to (a) validate the target exists
 * and (b) resolve who should receive a notification.
 */
const OWNER_LOOKUPS: Record<
  CommentTargetType,
  (id: string) => Promise<string | null>
> = {
  poll: async (id) => {
    const r = await db.poll.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  idea: async (id) => {
    const r = await db.idea.findUnique({ where: { id }, select: { authorId: true } });
    return r?.authorId ?? null;
  },
  event: async (id) => {
    const r = await db.event.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  recipe: async (id) => {
    const r = await db.recipe.findUnique({ where: { id }, select: { authorId: true } });
    return r?.authorId ?? null;
  },
  file: async (id) => {
    const r = await db.fileObject.findUnique({ where: { id }, select: { uploaderId: true } });
    return r?.uploaderId ?? null;
  },
  tierlist: async (id) => {
    const r = await db.tierList.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  listing: async (id) => {
    const r = await db.listing.findUnique({ where: { id }, select: { sellerId: true } });
    return r?.sellerId ?? null;
  },
  challenge: async (id) => {
    const r = await db.challenge.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  photo: async (id) => {
    const r = await db.photobookPhoto.findUnique({ where: { id }, select: { uploaderId: true } });
    return r?.uploaderId ?? null;
  },
  countdown: async (id) => {
    const r = await db.countdown.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  nowplaying: async (id) => {
    const r = await db.nowPlayingItem.findUnique({ where: { id }, select: { userId: true } });
    return r?.userId ?? null;
  },
  claim: async (id) => {
    const r = await db.claim.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  wish: async (id) => {
    const r = await db.wishlistItem.findUnique({ where: { id }, select: { userId: true } });
    return r?.userId ?? null;
  },
  smashdeck: async (id) => {
    const r = await db.smashDeck.findUnique({ where: { id }, select: { creatorId: true } });
    return r?.creatorId ?? null;
  },
  fitnessplan: async (id) => {
    const r = await db.fitnessPlan.findUnique({ where: { id }, select: { authorId: true } });
    return r?.authorId ?? null;
  },
};

/**
 * Resolve the owner of a comment target. Returns the userId of the owner
 * or null when the target doesn't exist.
 */
export async function resolveOwner(
  targetType: CommentTargetType,
  targetId: string
): Promise<string | null> {
  return OWNER_LOOKUPS[targetType](targetId);
}

/** Human-readable label for each target type, used in notification titles. */
export const TARGET_LABEL: Record<CommentTargetType, string> = {
  poll: "poll",
  idea: "idea",
  event: "event",
  recipe: "recipe",
  file: "file",
  tierlist: "tier list",
  listing: "listing",
  challenge: "challenge",
  photo: "photo",
  countdown: "countdown",
  nowplaying: "now-playing pick",
  claim: "stake",
  wish: "wish",
  smashdeck: "smash-or-pass deck",
  fitnessplan: "program",
};

/** The canonical href for viewing a given target. */
export function hrefForTarget(targetType: CommentTargetType, targetId: string): string {
  switch (targetType) {
    case "poll":      return `/polls`;
    case "idea":      return `/ideas`;
    case "event":     return `/events/${targetId}`;
    case "recipe":    return `/cookbook/${targetId}`;
    case "file":      return `/files`;
    case "tierlist":  return `/tiers/${targetId}`;
    case "listing":   return `/marketplace`;
    case "challenge": return `/challenges/${targetId}`;
    case "photo":     return `/photobook`;
    case "countdown": return `/countdowns`;
    case "nowplaying":return `/nowplaying`;
    case "claim":     return `/stakes`;
    case "wish":      return `/wishlist`;
    case "smashdeck": return `/smash/${targetId}`;
    case "fitnessplan": return `/pump/${targetId}`;
  }
}
