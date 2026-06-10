import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, LinkButton } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { PixelIcon } from "@/components/icons";
import { RsvpButtons } from "@/modules/events/RsvpButtons";

export const dynamic = "force-dynamic";

const BUCKETS = [
  { status: "going", label: "Going", badge: "bg-accent-green" },
  { status: "maybe", label: "Maybe", badge: "bg-accent-yellow" },
  { status: "no", label: "Can't make it", badge: "bg-accent-red text-white" },
] as const;

export default async function EventPage({ params }: { params: { id: string } }) {
  const [user, event] = await Promise.all([
    currentUser(),
    db.event.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        rsvps: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
      },
    }),
  ]);
  if (!user) redirect("/signin");
  if (!event) notFound();

  const canModify = user.id === event.creatorId || user.role === "admin";
  const mine = event.rsvps.find((r) => r.userId === user.id)?.status ?? null;
  const isPast = event.startAt < new Date();

  const dateLine = event.startAt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeLine = `${event.startAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${
    event.endAt
      ? "–" + event.endAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : ""
  }`;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        {isPast && <Badge className="bg-paper mb-2">Already happened</Badge>}
        <h1 className="text-3xl sm:text-4xl">{event.title}</h1>
        <p className="mt-2 font-mono text-sm uppercase text-ink/60">
          {dateLine} · {timeLine}
        </p>
        {event.location && (
          <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-ink/60">
            <PixelIcon name="map-pin" size={14} /> {event.location}
          </p>
        )}
        <p className="mt-1 text-sm text-ink/50">
          planned by {event.creator.displayName}
        </p>
      </div>

      {event.description && (
        <Card className="whitespace-pre-wrap text-sm leading-relaxed">
          {event.description}
        </Card>
      )}

      {!isPast && (
        <div>
          <p className="brutal-label">You in?</p>
          <RsvpButtons eventId={event.id} current={mine} />
        </div>
      )}

      <div className="space-y-3">
        {BUCKETS.map(({ status, label, badge }) => {
          const bucket = event.rsvps.filter((r) => r.status === status);
          if (bucket.length === 0) return null;
          return (
            <Card key={status}>
              <div className="flex items-center gap-2">
                <Badge className={badge}>{label}</Badge>
                <span className="font-mono text-xs text-ink/50">{bucket.length}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {bucket.map((r) => (
                  <span key={r.userId} className="inline-flex items-center gap-1.5">
                    <Avatar name={r.user.displayName} src={r.user.avatarUrl} size="sm" />
                    <span className="text-sm">{r.user.displayName}</span>
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {canModify && (
        <div className="flex gap-3 pt-2">
          <LinkButton href={`/events/${event.id}/edit`} variant="yellow">
            Edit
          </LinkButton>
          <DeleteButton endpoint={`/api/events/${event.id}`} redirectTo="/events" />
        </div>
      )}
    </div>
  );
}
