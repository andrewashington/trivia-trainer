import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddPollForm } from "@/modules/polls/AddPollForm";
import { PollCard } from "@/modules/polls/PollCard";
import { pollToResults } from "@/modules/polls/results";
import { HeroBanner } from "@/components/Hero";

export const metadata = { title: "Polls" };
export const dynamic = "force-dynamic";

export default async function PollsPage({
  searchParams,
}: {
  searchParams: { history?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const showHistory = searchParams.history === "1";

  const polls = await db.poll.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true } },
      options: { orderBy: { order: "asc" } },
      votes: { include: { user: { select: { id: true, displayName: true } } } },
      revealVotes: { select: { userId: true } },
    },
  });

  const openPolls = polls.filter((p) => p.closedAt === null);
  const closedPolls = polls.filter((p) => p.closedAt !== null);
  const shown = showHistory ? closedPolls : openPolls;

  // Hero: the open poll with the most votes that YOU haven't voted on;
  // falls back to the hottest open poll overall.
  const memberCount = await db.user.count();
  const hottest = [...openPolls].sort((a, b) => b.votes.length - a.votes.length);
  const needsMe = hottest.find((p) => !p.votes.some((v) => v.userId === user.id));
  const hero = needsMe ?? hottest[0] ?? null;
  const heroVoters = hero ? new Set(hero.votes.map((v) => v.userId)).size : 0;
  const heroSealed = hero ? hero.revealThreshold !== null && hero.revealVotes.length < hero.revealThreshold : false;

  return (
    <div className="space-y-6">
      {showHistory ? (
        <PageHeader
          title="Past polls"
          icon="archive"
          accentBg="bg-accent-indigo text-white"
          action={
            <Link
              href="/polls"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              ← Live polls
            </Link>
          }
        />
      ) : (
        <ModuleHeader
          title="Polls"
          icon="chart-bar-big"
          accentBg="bg-accent-indigo text-white"
          addLabel="Poll"
          extra={
            <Link
              href="/polls?history=1"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              Past polls ({closedPolls.length})
            </Link>
          }
        >
          <AddPollForm />
        </ModuleHeader>
      )}

      {!showHistory && hero && (
        <HeroBanner
          accentBg="bg-accent-indigo text-white"
          pattern="dots"
          kicker={needsMe ? "Your ballot is missing" : "The hot ballot"}
          kickerIcon="chart-bar-big"
          pulse={!!needsMe}
          jumpTo={`poll-${hero.id}`}
          jumpLabel={needsMe ? "Cast your vote ↓" : "See the results ↓"}
        >
          <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
            {hero.question}
          </h2>
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-white/80">
            {heroVoters}/{memberCount} voted
            {heroSealed ? ` · results sealed (${hero.revealVotes.length}/${hero.revealThreshold} to crack)` : ""}
            {needsMe ? " — the group awaits your wisdom ↓" : ""}
          </p>
          <div className="mt-3 h-4 max-w-xs border-2 border-ink bg-card">
            <div
              className="h-full bg-accent-yellow"
              style={{ width: `${Math.min(100, Math.round((heroVoters / Math.max(1, memberCount)) * 100))}%` }}
            />
          </div>
        </HeroBanner>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon="meh"
          title={showHistory ? "No closed polls yet" : "No polls yet"}
          hint={
            showHistory
              ? "Close a poll and it retires here with its results."
              : "Settle the tacos-vs-pizza debate once and for all."
          }
        />
      ) : (
        <ul className="space-y-4">
          {shown.map((p) => (
            <PollCard key={p.id} poll={pollToResults(p, user)} />
          ))}
        </ul>
      )}
    </div>
  );
}
