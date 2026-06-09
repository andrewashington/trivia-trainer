import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { AddIdeaForm } from "@/modules/ideas/AddIdeaForm";
import { IdeaCard, type IdeaView } from "@/modules/ideas/IdeaCard";

export const metadata = { title: "Ideas" };
export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const ideas = await db.idea.findMany({
    include: {
      author: { select: { id: true, displayName: true } },
      votes: { select: { userId: true } },
    },
  });

  const toView = (i: (typeof ideas)[number]): IdeaView => ({
    id: i.id,
    title: i.title,
    detail: i.detail,
    status: i.status,
    authorName: i.author.displayName,
    voteCount: i.votes.length,
    myVote: i.votes.some((v) => v.userId === user.id),
    canDelete: user.id === i.authorId || user.role === "admin",
    isAdmin: user.role === "admin",
  });

  // Open ideas ranked by votes (ties: newest first); shipped/planned
  // settle to the bottom as a quiet trophy shelf.
  const rank = { open: 0, planned: 1, done: 2 } as const;
  const sorted = [...ideas].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <div className="space-y-6">
      <PageHeader title="💡 Ideas" accentBg="bg-accent-lime" />
      <AddIdeaForm />

      {sorted.length === 0 ? (
        <EmptyState
          icon="🦗"
          title="The suggestion box is empty"
          hint="No bad ideas here. Well — some bad ideas, that's the fun part."
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((i) => (
            <IdeaCard key={i.id} idea={toView(i)} />
          ))}
        </ul>
      )}
    </div>
  );
}
