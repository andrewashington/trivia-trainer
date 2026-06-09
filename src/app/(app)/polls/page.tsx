import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { AddPollForm } from "@/modules/polls/AddPollForm";
import { PollCard } from "@/modules/polls/PollCard";
import { pollToResults } from "@/modules/polls/results";

export const metadata = { title: "Polls" };
export const dynamic = "force-dynamic";

export default async function PollsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const polls = await db.poll.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true } },
      options: { orderBy: { order: "asc" } },
      votes: { include: { user: { select: { id: true, displayName: true } } } },
    },
  });

  // Open polls first, both groups newest-first.
  const sorted = [...polls].sort((a, b) => {
    const aClosed = a.closedAt !== null ? 1 : 0;
    const bClosed = b.closedAt !== null ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <div className="space-y-6">
      <PageHeader title="🗳️ Polls" accentBg="bg-accent-indigo text-white" />
      <AddPollForm />

      {sorted.length === 0 ? (
        <EmptyState
          icon="🤷"
          title="No polls yet"
          hint="Settle the tacos-vs-pizza debate once and for all."
        />
      ) : (
        <ul className="space-y-4">
          {sorted.map((p) => (
            <PollCard key={p.id} poll={pollToResults(p, user)} />
          ))}
        </ul>
      )}
    </div>
  );
}
