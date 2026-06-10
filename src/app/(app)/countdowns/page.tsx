import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddCountdownForm } from "@/modules/countdowns/AddCountdownForm";
import { CountdownBoard, type TileView } from "@/modules/countdowns/CountdownBoard";
import { LANDED_WINDOW_MS } from "@/modules/countdowns/schema";

export const metadata = { title: "Countdowns" };
export const dynamic = "force-dynamic";

/** Next occurrence of a recurring month/day, today-or-later. */
function nextBirthday(birthday: Date): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), birthday.getUTCMonth(), birthday.getUTCDate());
  if (next.getTime() < now.getTime() - 86_400_000) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export default async function CountdownsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const now = new Date();

  const [countdowns, events, cards] = await Promise.all([
    db.countdown.findMany({
      where: { targetAt: { gte: new Date(now.getTime() - LANDED_WINDOW_MS) } },
      orderBy: { targetAt: "asc" },
      include: { creator: { select: { id: true, displayName: true } } },
    }),
    db.event.findMany({
      where: { startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true },
    }),
    db.contactCard.findMany({
      where: { birthday: { not: null } },
      include: { user: { select: { displayName: true } } },
    }),
  ]);

  const tiles: TileView[] = [
    ...countdowns.map(
      (c): TileView => ({
        kind: "countdown",
        id: c.id,
        title: c.title,
        emoji: c.emoji,
        targetAt: c.targetAt.toISOString(),
        link: c.link,
        creatorId: c.creator.id,
        creatorName: c.creator.displayName,
        canDelete: c.creatorId === user.id || user.role === "admin",
      })
    ),
    // Derived: upcoming events + birthdays within 90 days. Not stored,
    // not deletable — they live where their data lives.
    ...events.map(
      (e): TileView => ({
        kind: "event",
        id: e.id,
        title: e.title,
        emoji: null,
        targetAt: e.startAt.toISOString(),
        link: null,
        creatorId: null,
        creatorName: null,
        canDelete: false,
      })
    ),
    ...cards
      .map((c) => ({ card: c, next: nextBirthday(c.birthday!) }))
      .filter(({ next }) => next.getTime() - now.getTime() < 90 * 86_400_000)
      .map(
        ({ card, next }): TileView => ({
          kind: "birthday",
          id: card.userId,
          title: `${card.user.displayName.split(" ")[0]}'s birthday`,
          emoji: "🎂",
          targetAt: next.toISOString(),
          link: null,
          creatorId: null,
          creatorName: null,
          canDelete: false,
        })
      ),
  ].sort((a, b) => new Date(a.targetAt).getTime() - new Date(b.targetAt).getTime());

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Countdowns"
        icon="clock"
        accentBg="bg-accent-punch text-white"
        addLabel="Countdown"
        tagline="The group hype clock"
      >
        <AddCountdownForm />
      </ModuleHeader>

      <CountdownBoard tiles={tiles} />
    </div>
  );
}
