import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddPromptForm } from "@/modules/reveal/AddPromptForm";
import { HeroBanner } from "@/components/Hero";
import { Countdown } from "@/components/Countdown";
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
        unlockVotes: { select: { userId: true } },
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
      <ModuleHeader
        title="The Reveal"
        icon="eye"
        accentBg="bg-ink text-white"
        addLabel="Prompt"
        tagline="Answer blind, unmask together"
      >
        <AddPromptForm memberNames={memberNames} />
      </ModuleHeader>

      {(() => {
        // Hero: a prompt waiting on YOUR submission beats everything;
        // otherwise the next sealed note counting down to its unsealing.
        const waitingOnMe = open.find((v) => v.type !== "sealed" && !v.iSubmitted);
        const nextSeal = open
          .filter((v) => v.type === "sealed" && v.unlockAt)
          .sort((a, b) => new Date(a.unlockAt!).getTime() - new Date(b.unlockAt!).getTime())[0];
        if (waitingOnMe) {
          return (
            <HeroBanner accentBg="bg-ink text-white" pattern="checker" kicker="The group is waiting on you" kickerIcon="eye" pulse jumpTo={`prompt-${waitingOnMe.id}`} jumpLabel="Lock in your answer ↓">
              <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                {waitingOnMe.title}
              </h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-wide text-white/70">
                {waitingOnMe.submittedCount}/{waitingOnMe.memberCount} locked in — nobody sees anything until you do. ↓
              </p>
              <div className="mt-3 flex gap-1">
                {Array.from({ length: waitingOnMe.memberCount }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3.5 w-6 border-2 border-white/60 ${i < waitingOnMe.submittedCount ? "bg-accent-yellow" : "bg-transparent"}`}
                  />
                ))}
              </div>
            </HeroBanner>
          );
        }
        if (nextSeal) {
          return (
            <HeroBanner accentBg="bg-ink text-white" pattern="checker" kicker="Under seal" kickerIcon="mail" jumpTo={`prompt-${nextSeal.id}`} jumpLabel={nextSeal.unlockVotesNeeded !== null ? "Vote to unseal ↓" : "See the seal ↓"}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2 className="min-w-0 font-display text-2xl font-bold leading-tight sm:text-3xl">
                  {nextSeal.title}
                </h2>
                <p className="border-2 border-white/60 bg-card px-3 py-1 font-display text-2xl font-bold tabular-nums text-ink shadow-brutal-sm">
                  <Countdown to={nextSeal.unlockAt!} doneText="UNSEALING…" />
                </p>
              </div>
              {nextSeal.unlockVotesNeeded !== null && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-white/60">
                  or {nextSeal.unlockVoteCount}/{nextSeal.unlockVotesNeeded} votes cracks it early ↓
                </p>
              )}
            </HeroBanner>
          );
        }
        return null;
      })()}

      {views.length === 0 ? (
        <EmptyState
          icon="eye-off"
          title="Nothing hidden… yet"
          hint="Start a blind rank, or seal a time capsule to the future."
        />
      ) : (
        <>
          {open.filter((p) => p.type !== "sealed").length > 0 && (
            <section className="space-y-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
                Blind ranks
              </h2>
              <ul className="space-y-4">
                {open
                  .filter((p) => p.type !== "sealed")
                  .map((p) => (
                    <PromptCard key={p.id} prompt={p} memberNames={memberNames} />
                  ))}
              </ul>
            </section>
          )}
          {open.filter((p) => p.type === "sealed").length > 0 && (
            <section className="space-y-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
                Time capsules
              </h2>
              <ul className="space-y-4">
                {open
                  .filter((p) => p.type === "sealed")
                  .map((p) => (
                    <PromptCard key={p.id} prompt={p} memberNames={memberNames} />
                  ))}
              </ul>
            </section>
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
