import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddItemForm } from "@/modules/nowplaying/AddItemForm";
import { ItemActions } from "@/modules/nowplaying/ItemActions";
import { HeroBanner, Marquee } from "@/components/Hero";
import { MEDIA_ICONS } from "@/modules/nowplaying/schema";
import { PixelIcon } from "@/components/icons";

export const metadata = { title: "Now Playing" };
export const dynamic = "force-dynamic";

export default async function NowPlayingPage({
  searchParams,
}: {
  searchParams: { history?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const showHistory = searchParams.history === "1";

  const items = await db.nowPlayingItem.findMany({
    where: { status: showHistory ? "finished" : "active" },
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  // Group by person; the signed-in user's board floats to the top.
  const byUser = new Map<string, { name: string; avatarUrl: string | null; items: typeof items }>();
  for (const item of items) {
    const entry = byUser.get(item.userId) ?? { name: item.user.displayName, avatarUrl: item.user.avatarUrl, items: [] };
    entry.items.push(item);
    byUser.set(item.userId, entry);
  }
  const groups = [...byUser.entries()].sort(([a], [b]) =>
    a === user.id ? -1 : b === user.id ? 1 : 0
  );

  return (
    <div className="space-y-6">
      {showHistory ? (
        <PageHeader
          title="Now Playing"
          icon="tv"
          accentBg="bg-accent-yellow"
          action={
            <Link
              href="/nowplaying"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              ← Back to the board
            </Link>
          }
        />
      ) : (
        <ModuleHeader
          title="Now Playing"
          icon="tv"
          accentBg="bg-accent-yellow"
          addLabel="Add"
          extra={
            <Link
              href="/nowplaying?history=1"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              The graveyard
            </Link>
          }
        >
          <AddItemForm />
        </ModuleHeader>
      )}

      {!showHistory && items.length > 0 && (
        <HeroBanner accentBg="bg-accent-yellow" pattern="stripes" kicker="On the group brain" kickerIcon="tv" className="!px-0 !pb-4 !pt-4">
          <div className="pl-0">
            <Marquee>
              {items.map((item) => (
                <span key={item.id} className="inline-flex items-center gap-2 font-display text-xl font-bold uppercase">
                  <Avatar name={item.user.displayName} src={item.user.avatarUrl} size="sm" />
                  {item.user.displayName.split(" ")[0]}
                  <span className="text-ink/50">{item.mediaType === "book" ? "is reading" : item.mediaType === "movie" ? "watched" : "is watching"}</span>
                  {item.title}
                  <span className="text-accent-red">★</span>
                </span>
              ))}
            </Marquee>
          </div>
        </HeroBanner>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={showHistory ? "skull" : "radio"}
          title={showHistory ? "Nothing finished yet" : "The board is empty"}
          hint={
            showHistory
              ? "Finish something and it retires here with honor."
              : "Nobody's watching, reading, or bingeing anything? Suspicious."
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([userId, group]) => (
            <Card key={userId} className={userId === user.id ? "tilt-l" : ""}>
              <div className="flex items-center gap-2 border-b-2 border-ink pb-2">
                <Avatar name={group.name} src={group.avatarUrl} size="sm" />
                <span className="font-display font-bold">
                  {userId === user.id ? "You" : group.name}
                </span>
                <Badge className="bg-paper ml-auto">{group.items.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.id} className="relative flex items-start justify-between gap-2">
                    {item.posterPath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://image.tmdb.org/t/p/w185${item.posterPath}`}
                        alt=""
                        className="h-[72px] w-12 shrink-0 border-2 border-ink object-cover shadow-brutal-sm"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">
                        <PixelIcon name={MEDIA_ICONS[item.mediaType]} size={14} className="-mt-0.5 mr-1 inline" />
                        {item.title}
                      </p>
                      {showHistory && item.rating && (
                        <span className="mt-0.5 inline-flex gap-0.5 text-ink">
                          {Array.from({ length: item.rating }, (_, i) => (
                            <PixelIcon key={i} name="star" size={13} />
                          ))}
                        </span>
                      )}
                      {item.note && (
                        <p className="mt-0.5 text-sm italic text-ink/60">
                          &ldquo;{item.note}&rdquo;
                        </p>
                      )}
                    </div>
                    {!showHistory && (userId === user.id || user.role === "admin") && (
                      <ItemActions itemId={item.id} title={item.title} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {/* Required attribution for the search/poster data. */}
      <p className="flex items-center gap-2 pt-2 font-mono text-[10px] uppercase text-ink/40">
        {/* TMDB short logo, inlined (brand blue-green gradient). */}
        <svg viewBox="0 0 190 81" className="h-3 w-auto" aria-hidden="true">
          <defs>
            <linearGradient id="tmdbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#90cea1" />
              <stop offset="56%" stopColor="#3cbec9" />
              <stop offset="100%" stopColor="#00b3e5" />
            </linearGradient>
          </defs>
          <rect width="190" height="81" rx="11" fill="url(#tmdbGrad)" />
          <text x="95" y="55" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="38" fill="#0d253f">TMDB</text>
        </svg>
        Search &amp; posters powered by{" "}
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-ink/60"
        >
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
