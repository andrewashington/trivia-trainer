import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddIdeaForm } from "@/modules/ideas/AddIdeaForm";
import { HeroBanner } from "@/components/Hero";
import { IdeaCard, type IdeaView } from "@/modules/ideas/IdeaCard";

export const metadata = { title: "Ideas" };
export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const ideas = await db.idea.findMany({
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      votes: { select: { userId: true } },
    },
  });

  const toView = (i: (typeof ideas)[number]): IdeaView => ({
    id: i.id,
    title: i.title,
    detail: i.detail,
    status: i.status,
    authorName: i.author.displayName,
    authorAvatarUrl: i.author.avatarUrl,
    voteCount: i.votes.length,
    myVote: i.votes.some((v) => v.userId === user.id),
    canDelete: user.id === i.authorId || user.role === "admin",
    isAdmin: user.role === "admin",
  });

  // Open ideas ranked by votes (ties: newest first); planned and
  // shipped get their own clearly-labeled shelves below.
  const byVotes = (a: (typeof ideas)[number], b: (typeof ideas)[number]) => {
    if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length;
    return b.createdAt.getTime() - a.createdAt.getTime();
  };
  const open = ideas.filter((i) => i.status === "open").sort(byVotes);
  const planned = ideas.filter((i) => i.status === "planned").sort(byVotes);
  const done = ideas.filter((i) => i.status === "done").sort(byVotes);

  return (
    <div className="space-y-6">
      <ModuleHeader title="Ideas" icon="lightbulb" accentBg="bg-accent-lime" addLabel="Idea">
        <AddIdeaForm />
      </ModuleHeader>

      {open.length > 0 && (
        <HeroBanner accentBg="bg-accent-lime" pattern="rays" kicker="Leading the pack" kickerIcon="lightbulb" jumpTo={`idea-${open[0].id}`} jumpLabel="Pile on votes ↓">
          <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
            {open[0].title}
          </h2>
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink/70">
            {open[0].votes.length} vote{open[0].votes.length === 1 ? "" : "s"}
            {open[1]
              ? open[0].votes.length - open[1].votes.length === 0
                ? ` — TIED with “${open[1].title}”! Break it ↓`
                : ` — “${open[1].title}” is ${open[0].votes.length - open[1].votes.length} behind ↓`
              : " — unchallenged. Someone pitch a rival ↓"}
          </p>
        </HeroBanner>
      )}

      {ideas.length === 0 ? (
        <EmptyState
          icon="bug"
          title="The suggestion box is empty"
          hint="No bad ideas here. Well — some bad ideas, that's the fun part."
        />
      ) : (
        <>
          {open.length > 0 && (
            <ul className="space-y-3">
              {open.map((i) => (
                <IdeaCard key={i.id} idea={toView(i)} />
              ))}
            </ul>
          )}

          {planned.length > 0 && (
            <section>
              <h2 className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-accent-blue px-3 py-1 font-display text-sm font-bold uppercase tracking-wider text-white shadow-brutal-sm">
                <PixelIcon name="calendar" size={15} />
                Planned — happening
              </h2>
              <ul className="space-y-3">
                {planned.map((i) => (
                  <IdeaCard key={i.id} idea={toView(i)} />
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-accent-green px-3 py-1 font-display text-sm font-bold uppercase tracking-wider shadow-brutal-sm">
                <PixelIcon name="check" size={15} />
                Shipped — the trophy shelf
              </h2>
              <ul className="space-y-3">
                {done.map((i) => (
                  <IdeaCard key={i.id} idea={toView(i)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
