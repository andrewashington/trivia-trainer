import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { recentActivity } from "@/lib/activity";
import { modules } from "@/modules/registry";
import { Card } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";
import { getPetView, MOOD_META } from "@/modules/pet/engine";
import { Creature } from "@/modules/pet/Creature";

export const dynamic = "force-dynamic";

// Module key -> nav icon + accent, for tinting feed rows and chips.
const MOD = Object.fromEntries(modules.map((m) => [m.key, m]));
const DARK_ACCENTS = new Set([
  "bg-accent-blue",
  "bg-accent-forest",
  "bg-accent-indigo",
  "bg-accent-magenta",
  "bg-ink",
]);
const onAccent = (bg: string) => (DARK_ACCENTS.has(bg) ? "text-white" : "text-ink");

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(d: Date): string {
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  const w = Math.round(days / 7);
  return w < 5 ? `${w}w ago` : `${Math.round(days / 30)}mo ago`;
}

// The clear "do something" row at the top of home.
const QUICK_ACTIONS: { label: string; href: string; icon: IconName; bg: string }[] = [
  { label: "Plan an event", href: "/events", icon: "calendar", bg: "bg-accent-blue text-white" },
  { label: "Add a recipe", href: "/cookbook", icon: "book-open", bg: "bg-accent-red text-white" },
  { label: "Pitch an idea", href: "/ideas", icon: "lightbulb", bg: "bg-accent-lime" },
  { label: "List something", href: "/marketplace", icon: "store", bg: "bg-accent-magenta text-white" },
  { label: "Ask a poll", href: "/polls", icon: "chart-bar-big", bg: "bg-accent-indigo text-white" },
  { label: "Start a reveal", href: "/reveal", icon: "eye", bg: "bg-ink text-white" },
  { label: "Make a claim", href: "/stakes", icon: "target", bg: "bg-accent-forest text-white" },
  { label: "Add a wish", href: "/wishlist", icon: "gift", bg: "bg-accent-orange" },
  { label: "Pin a place", href: "/map", icon: "map-pin", bg: "bg-accent-teal text-white" },
  { label: "Log a watch", href: "/nowplaying", icon: "tv", bg: "bg-accent-yellow" },
  { label: "Add a person", href: "/contacts", icon: "contact", bg: "bg-accent-pink" },
  { label: "Upload a file", href: "/files", icon: "folder", bg: "bg-accent-green" },
  { label: "Stash a secret", href: "/vault", icon: "lock", bg: "bg-accent-cyan" },
  { label: "Play snake", href: "/snake", icon: "fish", bg: "bg-accent-grape text-white" },
];

export default async function HomePage() {
  const user = await currentUser();
  const [activity, nextEvent, latestPoll, activeCount, fileCount, pet] = await Promise.all([
    recentActivity(16),
    db.event.findFirst({
      where: { startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      include: { rsvps: true },
    }),
    db.poll.findFirst({
      where: { closedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { votes: true } } },
    }),
    db.nowPlayingItem.count({ where: { status: "active" } }),
    db.fileObject.count(),
    user ? getPetView(user.id) : null,
  ]);

  const firstName = user?.displayName.split(" ")[0] ?? "friend";

  return (
    <div className="space-y-8 pt-2">
      <div className="brutal-card mb-2 inline-block -rotate-1 px-5 py-3">
        <h1 className="text-2xl sm:text-3xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-ink/50">
          The group home base
        </p>
      </div>

      {/* The Pet: the group's vibe, front and center. */}
      {pet && (
        <Link href="/pet" className="no-underline">
          <div
            className={`brutal-card flex items-center gap-4 p-4 transition-transform hover:-translate-y-1 ${MOOD_META[pet.mood].bg}`}
          >
            <span className="shrink-0">
              <Creature mood={pet.mood} size={56} stage={pet.stage} beloved={pet.beloved} />
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

      {/* Clear primary actions. */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`brutal-press inline-flex items-center gap-2 border-3 border-ink px-3 py-2 font-display text-sm font-bold uppercase tracking-wide no-underline shadow-brutal ${a.bg}`}
          >
            <PixelIcon name={a.icon} size={16} />
            {a.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* The feed: the social-app centerpiece. */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
            <PixelIcon name="zap" size={18} />
            What&apos;s new
          </h2>
          {activity.length === 0 ? (
            <Card>
              <p className="text-sm text-ink/60">
                Quiet in here. Use the buttons above to get the group going →
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {activity.map((item) => {
                const mod = MOD[item.module];
                const bg = mod?.accentBg ?? "bg-accent-blue";
                return (
                  <li key={`${item.module}-${item.id}`}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3 border-2 border-ink bg-card px-3 py-2 no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ink ${bg} ${onAccent(bg)}`}
                      >
                        <PixelIcon name={mod?.icon ?? "zap"} size={16} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-bold">{item.actor}</span>{" "}
                        <span className="text-ink/60">{item.verb}</span>{" "}
                        <span className="font-bold">{item.title}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase text-ink/40">
                        {timeAgo(item.at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right rail: the can't-miss highlights + a few numbers. */}
        <aside className="space-y-4">
          <Link href={nextEvent ? `/events/${nextEvent.id}` : "/events"} className="no-underline">
            <Card className="transition-transform hover:-translate-y-1">
              <span className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="calendar" size={13} /> Next up
              </span>
              {nextEvent ? (
                <>
                  <p className="mt-1 font-display text-lg font-bold leading-tight">{nextEvent.title}</p>
                  <p className="mt-1 text-sm text-ink/60">
                    {nextEvent.startAt.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {nextEvent.rsvps.filter((r) => r.status === "going").length} going
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink/60">Nothing scheduled. Plan something →</p>
              )}
            </Card>
          </Link>

          <Link href="/polls" className="no-underline">
            <Card className="transition-transform hover:-translate-y-1">
              <span className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="chart-bar-big" size={13} /> Open poll
              </span>
              {latestPoll ? (
                <>
                  <p className="mt-1 font-display text-lg font-bold leading-tight">{latestPoll.question}</p>
                  <p className="mt-1 text-sm text-ink/60">
                    {latestPoll._count.votes} vote{latestPoll._count.votes === 1 ? "" : "s"} so far
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink/60">No open polls. Put it to a vote →</p>
              )}
            </Card>
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/nowplaying" className="no-underline">
              <Card className="h-full text-center transition-transform hover:-translate-y-1">
                <p className="font-display text-2xl font-bold">{activeCount}</p>
                <p className="font-mono text-[10px] uppercase text-ink/50">playing now</p>
              </Card>
            </Link>
            <Link href="/files" className="no-underline">
              <Card className="h-full text-center transition-transform hover:-translate-y-1">
                <p className="font-display text-2xl font-bold">{fileCount}</p>
                <p className="font-mono text-[10px] uppercase text-ink/50">in the stash</p>
              </Card>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
