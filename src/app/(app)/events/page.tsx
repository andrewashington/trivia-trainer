import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CopyIcalLink } from "@/modules/events/CopyIcalLink";
import { HeroBanner, HeroCta } from "@/components/Hero";
import { Countdown } from "@/components/Countdown";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

type EventWithRsvps = Awaited<ReturnType<typeof fetchEvents>>["upcoming"][number];

async function fetchEvents() {
  const now = new Date();
  const include = {
    rsvps: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
  } as const;
  const [upcoming, past] = await Promise.all([
    db.event.findMany({
      where: { startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include,
    }),
    db.event.findMany({
      where: { startAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: 20,
      include,
    }),
  ]);
  return { upcoming, past };
}

function EventCard({ event, dim }: { event: EventWithRsvps; dim?: boolean }) {
  const going = event.rsvps.filter((r) => r.status === "going");
  return (
    <Link href={`/events/${event.id}`} className="no-underline">
      <Card
        className={`transition-transform hover:-translate-y-1 ${dim ? "opacity-60" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold leading-tight">{event.title}</p>
            <p className="mt-1 font-mono text-xs uppercase text-ink/60">
              {event.startAt.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              ·{" "}
              {event.startAt.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <Badge className="bg-accent-blue text-white shrink-0">
            {going.length} going
          </Badge>
        </div>
        {going.length > 0 && (
          <div className="mt-3 flex -space-x-1">
            {going.slice(0, 8).map((r) => (
              <Avatar key={r.userId} name={r.user.displayName} src={r.user.avatarUrl} size="sm" />
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}

export default async function EventsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { upcoming, past } = await fetchEvents();

  // Hero: the next hang, with a live countdown and whether YOU are in.
  const next = upcoming[0] ?? null;
  const myRsvp = next?.rsvps.find((r) => r.userId === user.id) ?? null;
  const nextGoing = next?.rsvps.filter((r) => r.status === "going") ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Events"
        icon="calendar"
        accentBg="bg-accent-blue text-white"
        action={<LinkButton href="/events/new" variant="yellow">+ Event</LinkButton>}
      />

      {next && (
        <HeroBanner
          accentBg="bg-accent-blue text-white"
          pattern="stripes"
          kicker="Next hang"
          kickerIcon="calendar"
          pulse={!myRsvp}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-3xl font-bold leading-none sm:text-4xl">
                {next.title}
              </h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-wide text-white/80">
                {next.startAt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                {next.location ? ` · ${next.location}` : ""}
              </p>
              <p className="mt-3 inline-block border-2 border-ink bg-ink px-3 py-1 font-display text-2xl font-bold tabular-nums text-accent-yellow shadow-brutal-sm">
                <Countdown to={next.startAt.toISOString()} doneText="IT'S HAPPENING" />
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {nextGoing.length > 0 && (
                <div className="flex -space-x-1.5">
                  {nextGoing.slice(0, 6).map((r) => (
                    <Avatar key={r.userId} name={r.user.displayName} src={r.user.avatarUrl} size="sm" />
                  ))}
                </div>
              )}
              <HeroCta
                href={`/events/${next.id}`}
                className={myRsvp ? "bg-card text-ink" : "bg-accent-yellow text-ink"}
              >
                {myRsvp ? `You're ${myRsvp.status === "going" ? "in ✓" : myRsvp.status}` : "RSVP now →"}
              </HeroCta>
            </div>
          </div>
        </HeroBanner>
      )}

      <section className="space-y-4">
        {upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing planned"
            hint="The calendar is wide open. Be the hero who fixes that."
          />
        ) : (
          upcoming.map((e) => <EventCard key={e.id} event={e} />)
        )}
        <div className="pt-1">
          <CopyIcalLink token={user.icalToken} />
        </div>
      </section>

      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
            The before times
          </h2>
          {past.map((e) => (
            <EventCard key={e.id} event={e} dim />
          ))}
        </section>
      )}
    </div>
  );
}
