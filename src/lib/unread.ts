import type { User } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Per-module "unread" counts for the nav badges: how many items in each
 * module are newer than the last time this user opened it, and that
 * someone *else* created (you don't get badged for your own stuff).
 *
 * The baseline for a module the user has never opened is their account
 * creation date — so a new member isn't greeted with the entire history
 * marked unread, only what's genuinely new since they joined.
 *
 * Keyed by module `key` from the registry (see src/modules/registry.ts).
 */
export type UnreadCounts = Record<string, number>;

type SeenMap = Record<string, string>;

export async function unreadCounts(user: User): Promise<UnreadCounts> {
  const seen = (user.moduleSeenAt as SeenMap | null) ?? {};
  const me = user.id;
  // Items newer than the user's last visit to this module (or, if never
  // visited, newer than when they joined).
  const after = (key: string) => {
    const s = seen[key];
    return { gt: s ? new Date(s) : user.createdAt };
  };

  const [
    cookbook,
    events,
    nowplaying,
    files,
    wishlist,
    map,
    ideas,
    marketplace,
    polls,
    reveal,
    stakes,
    vault,
    fitness,
  ] = await Promise.all([
    db.recipe.count({ where: { createdAt: after("cookbook"), authorId: { not: me } } }),
    db.event.count({ where: { createdAt: after("events"), creatorId: { not: me } } }),
    db.nowPlayingItem.count({ where: { updatedAt: after("nowplaying"), userId: { not: me } } }),
    db.fileObject.count({ where: { createdAt: after("files"), uploaderId: { not: me } } }),
    db.wishlistItem.count({ where: { createdAt: after("wishlist"), userId: { not: me } } }),
    db.mapPin.count({ where: { createdAt: after("map"), creatorId: { not: me } } }),
    db.idea.count({ where: { createdAt: after("ideas"), authorId: { not: me } } }),
    db.listing.count({ where: { createdAt: after("marketplace"), sellerId: { not: me } } }),
    db.poll.count({ where: { createdAt: after("polls"), creatorId: { not: me } } }),
    db.revealPrompt.count({ where: { createdAt: after("reveal"), creatorId: { not: me } } }),
    db.claim.count({ where: { createdAt: after("stakes"), creatorId: { not: me } } }),
    db.vaultEntry.count({ where: { createdAt: after("vault"), creatorId: { not: me } } }),
    db.fitnessPlan.count({ where: { createdAt: after("fitness"), authorId: { not: me } } }),
  ]);

  return {
    cookbook,
    events,
    nowplaying,
    files,
    wishlist,
    map,
    ideas,
    marketplace,
    polls,
    reveal,
    stakes,
    vault,
    fitness,
  };
}
