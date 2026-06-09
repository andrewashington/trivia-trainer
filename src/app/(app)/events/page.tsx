import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CopyIcalLink } from "@/modules/events/CopyIcalLink";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

type EventWithRsvps = Awaited<ReturnType<typeof fetchEvents>>["upcoming"][number];

async function fetchEvents() {
  const now = new Date();
  const include = {
    rsvps: { include: { user: { select: { id: true, displayName: true } } } },
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
              <Avatar key={r.userId} name={r.user.displayName} size="sm" />
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="📅 Events"
        accentBg="bg-accent-blue text-white"
        action={<LinkButton href="/events/new" variant="yellow">+ Event</LinkButton>}
      />

      <section className="space-y-4">
        {upcoming.length === 0 ? (
          <EmptyState
            icon="🗓️"
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
