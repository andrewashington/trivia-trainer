import Link from "next/link";
import { db } from "@/lib/db";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { HeroBanner, HeroCta } from "@/components/Hero";
import { commentCounts } from "@/modules/comments/counts";
import { coerceDoc } from "@/modules/fitness/PlanDocView";
import { countLifts } from "@/modules/fitness/schema";
import { sessionDaysThisWeek } from "@/modules/fitness/service";

export const metadata = { title: "The Pump" };
export const dynamic = "force-dynamic";

export default async function PumpPage() {
  const plans = await db.fitnessPlan.findMany({ orderBy: { createdAt: "desc" } });
  const [authors, comments, adoptions, weekLogs] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(plans.map((p) => p.authorId))] } },
      select: { id: true, displayName: true, avatarUrl: true },
    }),
    commentCounts("fitnessplan"),
    db.fitnessAdoption.groupBy({ by: ["planId"], _count: true }),
    db.fitnessLog.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 8 * 864e5) } },
      select: { userId: true, createdAt: true },
    }),
  ]);
  const authorFor = new Map(authors.map((u) => [u.id, u]));
  const runningCount = new Map(adoptions.map((a) => [a.planId, a._count]));

  // Who showed up this week (distinct training days, group-tz, Mon-anchored).
  const weekDays = sessionDaysThisWeek(weekLogs);
  const grinders = await db.user.findMany({
    where: { id: { in: [...weekDays.keys()] } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const grinderRows = grinders
    .map((u) => ({ ...u, days: weekDays.get(u.id) ?? 0 }))
    .sort((a, b) => b.days - a.days);

  const spotlight = plans[0];
  const spotlightAuthor = spotlight ? authorFor.get(spotlight.authorId) : null;

  return (
    <div>
      <PageHeader
        title="The Pump"
        icon="dumbbell"
        accentBg="bg-accent-bronze text-ink"
        action={
          <span className="flex gap-2">
            <LinkButton href="/pump/wall" variant="ghost">🏆 The Wall</LinkButton>
            <LinkButton href="/pump/new" variant="yellow">+ Program</LinkButton>
          </span>
        }
      />

      {grinderRows.length > 0 && (
        <div className="brutal-card mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 !p-3">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink/50">
            This week
          </span>
          {grinderRows.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1.5">
              <Avatar name={g.displayName} src={g.avatarUrl} size="sm" />
              <span className="font-display text-sm font-bold">{g.displayName}</span>
              <span className="font-mono text-xs text-ink/60">
                ×{g.days}{g.days >= 3 ? " 🔥" : ""}
              </span>
            </span>
          ))}
        </div>
      )}

      {spotlight && (
        <HeroBanner
          accentBg="bg-accent-bronze text-ink"
          pattern="stripes"
          kicker="Fresh off the forge"
          kickerIcon="fire"
          className="mb-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                {spotlight.title}
              </h2>
              <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-ink/70">
                {spotlightAuthor && (
                  <Link
                    href={`/people/${spotlightAuthor.id}`}
                    className="inline-flex items-center gap-1.5 text-ink no-underline"
                  >
                    <Avatar name={spotlightAuthor.displayName} src={spotlightAuthor.avatarUrl} size="sm" />
                    {spotlightAuthor.displayName}
                  </Link>
                )}
                · who's brave enough to run it?
              </p>
            </div>
            <HeroCta href={`/pump/${spotlight.id}`} className="bg-accent-yellow text-ink">
              Inspect the damage →
            </HeroCta>
          </div>
        </HeroBanner>
      )}

      {plans.length === 0 ? (
        <EmptyState
          icon="dumbbell"
          title="No programs yet"
          hint="Somewhere, a barbell weeps unlifted. Paste a program and forge the first card."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {plans.map((plan, i) => {
            const author = authorFor.get(plan.authorId);
            const doc = coerceDoc(plan.doc);
            const days = doc?.days.length ?? 0;
            const lifts = doc ? countLifts(doc) : 0;
            const nComments = comments.get(plan.id) ?? 0;
            return (
              <Link key={plan.id} href={`/pump/${plan.id}`} className="no-underline">
                <Card
                  className={`h-full transition-transform hover:-translate-y-1 ${i % 2 === 0 ? "tilt-l" : "tilt-r"}`}
                >
                  <p className="font-display text-lg font-bold leading-tight">{plan.title}</p>
                  {plan.blurb && <p className="mt-1 text-sm text-ink/70">{plan.blurb}</p>}
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {plan.goal && <Badge className="bg-accent-bronze/20">{plan.goal}</Badge>}
                    {days > 0 && <Badge>{days} day{days === 1 ? "" : "s"}</Badge>}
                    {lifts > 0 && <Badge>{lifts} lifts</Badge>}
                    {plan.equipment && <Badge>{plan.equipment}</Badge>}
                    {(runningCount.get(plan.id) ?? 0) > 0 && (
                      <Badge className="bg-accent-bronze/20">💪 {runningCount.get(plan.id)} running</Badge>
                    )}
                    {nComments > 0 && <Badge className="bg-paper">💬 {nComments}</Badge>}
                  </p>
                  {author && (
                    <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs uppercase text-ink/50">
                      forged by <Avatar name={author.displayName} src={author.avatarUrl} size="sm" />{" "}
                      {author.displayName}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
