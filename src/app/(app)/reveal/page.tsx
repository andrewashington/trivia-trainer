import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { AddPromptForm } from "@/modules/reveal/AddPromptForm";
import { PromptCard } from "@/modules/reveal/PromptCard";
import { sweepReveals, toPromptView } from "@/modules/reveal/engine";

export const metadata = { title: "The Reveal" };
export const dynamic = "force-dynamic";

export default async function RevealPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  await sweepReveals();
  const [prompts, members] = await Promise.all([
    db.revealPrompt.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, displayName: true } },
        submissions: { include: { user: { select: { id: true, displayName: true } } } },
      },
    }),
    db.user.findMany({ select: { displayName: true }, orderBy: { displayName: "asc" } }),
  ]);
  const memberNames = members.map((m) => m.displayName);
  const views = prompts.map((p) => toPromptView(p, user, memberNames.length));
  const open = views.filter((v) => v.status === "open");
  const revealed = views.filter((v) => v.status === "revealed");

  return (
    <div className="space-y-6">
      <PageHeader title="🎭 The Reveal" accentBg="bg-ink text-white" />
      <AddPromptForm memberNames={memberNames} />

      {views.length === 0 ? (
        <EmptyState
          icon="🫣"
          title="Nothing hidden… yet"
          hint="Start a blind rank, seal a note to the future, or ask the oracle."
        />
      ) : (
        <>
          {open.length > 0 && (
            <ul className="space-y-4">
              {open.map((p) => (
                <PromptCard key={p.id} prompt={p} memberNames={memberNames} />
              ))}
            </ul>
          )}
          {revealed.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
                Revealed
              </h2>
              <ul className="space-y-4">
                {revealed.map((p) => (
                  <PromptCard key={p.id} prompt={p} memberNames={memberNames} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
