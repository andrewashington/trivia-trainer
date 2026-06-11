import { db } from "@/lib/db";

/**
 * A unified "what's happened lately" feed for the home page, merged from
 * the user-generated content across modules and sorted newest-first.
 * Each item is flattened to a common shape so the feed renders uniformly;
 * `module` keys back into the registry for the icon + accent color.
 *
 * Pass `userId` to scope the feed to one person — that's what powers the
 * "lately" column on profile pages (/people/[id]).
 */
export type Activity = {
  id: string;
  module: string;
  actorId: string;
  actor: string;
  actorAvatarUrl: string | null;
  verb: string;
  title: string;
  href: string;
  at: Date;
  sensitive?: boolean;
};

// How many of each kind to pull before merging — keeps the union small.
const PER_KIND = 6;

export async function recentActivity(limit = 16, userId?: string): Promise<Activity[]> {
  const who = { select: { id: true, displayName: true, avatarUrl: true } };
  // When scoped to one person, pull deeper per kind so a prolific module
  // doesn't starve the merged feed.
  const recent = {
    take: userId ? Math.min(limit, 12) : PER_KIND,
    orderBy: { createdAt: "desc" },
  } as const;
  const [recipes, events, listings, ideas, polls, wishlist, pins, files, reveals, claims, countdowns, playing, tanksGames] =
    await Promise.all([
      db.recipe.findMany({ ...recent, where: userId ? { authorId: userId } : undefined, include: { author: who } }),
      db.event.findMany({ ...recent, where: userId ? { creatorId: userId } : undefined, include: { creator: who } }),
      db.listing.findMany({ ...recent, where: userId ? { sellerId: userId } : undefined, include: { seller: who } }),
      db.idea.findMany({ ...recent, where: userId ? { authorId: userId } : undefined, include: { author: who } }),
      db.poll.findMany({ ...recent, where: userId ? { creatorId: userId } : undefined, include: { creator: who } }),
      db.wishlistItem.findMany({ ...recent, where: userId ? { userId } : undefined, include: { user: who } }),
      db.mapPin.findMany({ ...recent, where: userId ? { creatorId: userId } : undefined, include: { creator: who } }),
      db.fileObject.findMany({ ...recent, where: userId ? { uploaderId: userId } : undefined, include: { uploader: who } }),
      db.revealPrompt.findMany({ ...recent, where: userId ? { creatorId: userId } : undefined, include: { creator: who } }),
      db.claim.findMany({ ...recent, where: userId ? { creatorId: userId } : undefined, include: { creator: who } }),
      db.countdown.findMany({ ...recent, where: userId ? { creatorId: userId } : undefined, include: { creator: who } }),
      db.nowPlayingItem.findMany({
        take: recent.take,
        orderBy: { updatedAt: "desc" },
        where: userId ? { userId } : undefined,
        include: { user: who },
      }),
      db.tanksGame.findMany({
        ...recent,
        where: userId ? { challengerId: userId } : undefined,
        include: { challenger: who, opponent: who },
      }),
    ]);

  const items: Activity[] = [
    ...recipes.map((r) => mk(r.id, "cookbook", r.author, "added a recipe", r.title, `/cookbook/${r.id}`, r.createdAt)),
    ...events.map((e) => mk(e.id, "events", e.creator, "planned", e.title, `/events/${e.id}`, e.createdAt)),
    ...listings.map((l) => mk(l.id, "marketplace", l.seller, "listed", l.title, "/marketplace", l.createdAt)),
    ...ideas.map((i) => mk(i.id, "ideas", i.author, "pitched an idea", i.title, "/ideas", i.createdAt)),
    ...polls.map((p) => { const a = mk(p.id, "polls", p.creator, "opened a poll", p.question, "/polls", p.createdAt); a.sensitive = p.sensitive; return a; }),
    ...wishlist.map((w) => mk(w.id, "wishlist", w.user, "is wishing for", w.title, "/wishlist", w.createdAt)),
    ...pins.map((p) => mk(p.id, "map", p.creator, "dropped a pin", p.name, "/map", p.createdAt)),
    ...files.map((f) => { const a = mk(f.id, "files", f.uploader, "uploaded", f.filename, "/files", f.createdAt); a.sensitive = f.sensitive; return a; }),
    ...reveals.map((r) => mk(r.id, "reveal", r.creator, "started a reveal", r.title, "/reveal", r.createdAt)),
    ...claims.map((c) => mk(c.id, "stakes", c.creator, "called a shot", c.text, "/stakes", c.createdAt)),
    ...countdowns.map((c) => mk(c.id, "countdowns", c.creator, "started a countdown to", c.title, "/countdowns", c.createdAt)),
    ...tanksGames.map((g) =>
      mk(
        g.id,
        "tanks",
        g.challenger,
        "challenged",
        `${g.opponent.displayName} to a tank duel`,
        `/tanks/${g.id}`,
        g.createdAt
      )
    ),
    ...playing.map((n) =>
      mk(
        n.id,
        "nowplaying",
        n.user,
        n.status === "finished" ? "finished" : n.mediaType === "book" ? "is reading" : "is watching",
        n.title,
        "/nowplaying",
        n.updatedAt
      )
    ),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

function mk(
  id: string,
  module: string,
  who: { id: string; displayName: string; avatarUrl: string | null },
  verb: string,
  title: string,
  href: string,
  at: Date
): Activity {
  return { id, module, actorId: who.id, actor: who.displayName, actorAvatarUrl: who.avatarUrl, verb, title, href, at };
}
