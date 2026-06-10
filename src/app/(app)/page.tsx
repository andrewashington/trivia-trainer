import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";
import { getPetView, MOOD_META } from "@/modules/pet/engine";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function TileBadge({
  icon,
  className,
  children,
}: {
  icon: IconName;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Badge className={`inline-flex items-center gap-1.5 ${className}`}>
      <PixelIcon name={icon} size={13} />
      {children}
    </Badge>
  );
}

export default async function HomePage() {
  const user = await currentUser();
  const [nextEvent, latestRecipe, activeCount, fileCount, latestPoll, topIdea, pet] =
    await Promise.all([
      db.event.findFirst({
        where: { startAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        include: { rsvps: true },
      }),
      db.recipe.findFirst({
        orderBy: { createdAt: "desc" },
        include: { author: { select: { displayName: true } } },
      }),
      db.nowPlayingItem.count({ where: { status: "active" } }),
      db.fileObject.count(),
      db.poll.findFirst({
        where: { closedAt: null },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { votes: true } } },
      }),
      db.idea.findFirst({
        where: { status: "open" },
        orderBy: [{ votes: { _count: "desc" } }, { createdAt: "desc" }],
        include: { _count: { select: { votes: true } } },
      }),
      user ? getPetView(user.id) : null,
    ]);

  const firstName = user?.displayName.split(" ")[0] ?? "friend";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1 font-mono text-sm uppercase tracking-widest text-ink/50">
          The group home base
        </p>
      </div>

      {/* The Pet: the group's vibe, front and center. */}
      {pet && (
        <Link href="/pet" className="no-underline">
          <div
            className={`brutal-card flex items-center gap-4 p-4 transition-transform hover:-translate-y-1 ${MOOD_META[pet.mood].bg}`}
          >
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center border-3 border-ink bg-card shadow-brutal ${
                pet.mood === "thriving" || pet.mood === "happy" ? "animate-wiggle" : ""
              }`}
            >
              <PixelIcon name={MOOD_META[pet.mood].face} size={36} />
            </span>
            <div>
              <p className="font-display font-bold leading-tight">
                {pet.name} {MOOD_META[pet.mood].line}
              </p>
              <p className="font-mono text-[10px] uppercase text-ink/50">
                the group vibe, in creature form →
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* What's-happening tiles, one per module, in module accent colors. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={nextEvent ? `/events/${nextEvent.id}` : "/events"} className="no-underline">
          <Card className="tilt-l h-full transition-transform hover:-translate-y-1">
            <TileBadge icon="calendar" className="bg-accent-blue text-white">
              Next up
            </TileBadge>
            {nextEvent ? (
              <>
                <p className="mt-2 font-display text-xl font-bold">{nextEvent.title}</p>
                <p className="mt-1 text-sm text-ink/60">
                  {nextEvent.startAt.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {nextEvent.rsvps.filter((r) => r.status === "going").length} going
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/60">
                Nothing on the calendar. Plan something →
              </p>
            )}
          </Card>
        </Link>

        <Link
          href={latestRecipe ? `/cookbook/${latestRecipe.id}` : "/cookbook"}
          className="no-underline"
        >
          <Card className="tilt-r h-full transition-transform hover:-translate-y-1">
            <TileBadge icon="book-open" className="bg-accent-red text-white">
              Fresh recipe
            </TileBadge>
            {latestRecipe ? (
              <>
                <p className="mt-2 font-display text-xl font-bold">{latestRecipe.title}</p>
                <p className="mt-1 text-sm text-ink/60">
                  by {latestRecipe.author.displayName}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/60">
                The cookbook is empty. Add the first one →
              </p>
            )}
          </Card>
        </Link>

        <Link
          href={latestPoll ? `/polls` : "/polls"}
          className="no-underline"
        >
          <Card className="tilt-l h-full transition-transform hover:-translate-y-1">
            <TileBadge icon="chart-bar-big" className="bg-accent-indigo text-white">
              Open poll
            </TileBadge>
            {latestPoll ? (
              <>
                <p className="mt-2 font-display text-xl font-bold">{latestPoll.question}</p>
                <p className="mt-1 text-sm text-ink/60">
                  {latestPoll._count.votes} vote{latestPoll._count.votes === 1 ? "" : "s"} so far
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/60">
                No open polls. Put something to a vote →
              </p>
            )}
          </Card>
        </Link>

        <Link href="/nowplaying" className="no-underline">
          <Card className="tilt-r h-full transition-transform hover:-translate-y-1">
            <TileBadge icon="tv" className="bg-accent-yellow">
              Now playing
            </TileBadge>
            <p className="mt-2 text-sm text-ink/60">
              {activeCount > 0
                ? `${activeCount} thing${activeCount === 1 ? "" : "s"} being watched & read right now`
                : "Nobody's watching anything?! Fix that →"}
            </p>
          </Card>
        </Link>

        <Link href="/ideas" className="no-underline">
          <Card className="tilt-l h-full transition-transform hover:-translate-y-1">
            <TileBadge icon="lightbulb" className="bg-accent-lime">
              Top idea
            </TileBadge>
            {topIdea ? (
              <>
                <p className="mt-2 font-display text-xl font-bold">{topIdea.title}</p>
                <p className="mt-1 text-sm text-ink/60">
                  {topIdea._count.votes} vote{topIdea._count.votes === 1 ? "" : "s"} · have your say →
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/60">
                The suggestion box is empty. Pitch something →
              </p>
            )}
          </Card>
        </Link>

        <Link href="/files" className="no-underline">
          <Card className="tilt-r h-full transition-transform hover:-translate-y-1">
            <TileBadge icon="folder" className="bg-accent-green">
              The stash
            </TileBadge>
            <p className="mt-2 text-sm text-ink/60">
              {fileCount > 0
                ? `${fileCount} file${fileCount === 1 ? "" : "s"} in the shared stash`
                : "No files yet. Drop something in →"}
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
