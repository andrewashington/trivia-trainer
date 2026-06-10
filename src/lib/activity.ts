import { db } from "@/lib/db";

/**
 * A unified "what's happened lately" feed for the home page, merged from
 * the user-generated content across modules and sorted newest-first.
 * Each item is flattened to a common shape so the feed renders uniformly;
 * `module` keys back into the registry for the icon + accent color.
 */
export type Activity = {
  id: string;
  module: string;
  actor: string;
  actorAvatarUrl: string | null;
  verb: string;
  title: string;
  href: string;
  at: Date;
};

// How many of each kind to pull before merging — keeps the union small.
const PER_KIND = 6;

export async function recentActivity(limit = 16): Promise<Activity[]> {
  const who = { select: { displayName: true, avatarUrl: true } };
  const recent = { take: PER_KIND, orderBy: { createdAt: "desc" } } as const;

  const [recipes, events, listings, ideas, polls, wishlist, pins, files, reveals, claims, countdowns, playing] =
    await Promise.all([
      db.recipe.findMany({ ...recent, include: { author: who } }),
      db.event.findMany({ ...recent, include: { creator: who } }),
      db.listing.findMany({ ...recent, include: { seller: who } }),
      db.idea.findMany({ ...recent, include: { author: who } }),
      db.poll.findMany({ ...recent, include: { creator: who } }),
      db.wishlistItem.findMany({ ...recent, include: { user: who } }),
      db.mapPin.findMany({ ...recent, include: { creator: who } }),
      db.fileObject.findMany({ ...recent, include: { uploader: who } }),
      db.revealPrompt.findMany({ ...recent, include: { creator: who } }),
      db.claim.findMany({ ...recent, include: { creator: who } }),
      db.countdown.findMany({ ...recent, include: { creator: who } }),
      db.nowPlayingItem.findMany({
        take: PER_KIND,
        orderBy: { updatedAt: "desc" },
        include: { user: who },
      }),
    ]);

  const items: Activity[] = [
    ...recipes.map((r) => mk(r.id, "cookbook", r.author, "added a recipe", r.title, "/cookbook", r.createdAt)),
    ...events.map((e) => mk(e.id, "events", e.creator, "planned", e.title, "/events", e.createdAt)),
    ...listings.map((l) => mk(l.id, "marketplace", l.seller, "listed", l.title, "/marketplace", l.createdAt)),
    ...ideas.map((i) => mk(i.id, "ideas", i.author, "pitched an idea", i.title, "/ideas", i.createdAt)),
    ...polls.map((p) => mk(p.id, "polls", p.creator, "opened a poll", p.question, "/polls", p.createdAt)),
    ...wishlist.map((w) => mk(w.id, "wishlist", w.user, "is wishing for", w.title, "/wishlist", w.createdAt)),
    ...pins.map((p) => mk(p.id, "map", p.creator, "dropped a pin", p.name, "/map", p.createdAt)),
    ...files.map((f) => mk(f.id, "files", f.uploader, "uploaded", f.filename, "/files", f.createdAt)),
    ...reveals.map((r) => mk(r.id, "reveal", r.creator, "started a reveal", r.title, "/reveal", r.createdAt)),
    ...claims.map((c) => mk(c.id, "stakes", c.creator, "called a shot", c.text, "/stakes", c.createdAt)),
    ...countdowns.map((c) => mk(c.id, "countdowns", c.creator, "started a countdown to", c.title, "/countdowns", c.createdAt)),
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
  who: { displayName: string; avatarUrl: string | null },
  verb: string,
  title: string,
  href: string,
  at: Date
): Activity {
  return { id, module, actor: who.displayName, actorAvatarUrl: who.avatarUrl, verb, title, href, at };
}
