import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { ModuleHeader } from "@/components/ModuleHeader";
import { NewChallengeForm } from "@/modules/challenges/NewChallengeForm";
import { isOpen, settleOverdue } from "@/modules/challenges/lib";

export const metadata = { title: "Challenges" };
export const dynamic = "force-dynamic";

function timeLeft(deadline: Date): string {
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) return "deadline hit";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

export default async function ChallengesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // Lazy settlement: any challenge whose deadline passed gets its
  // winner crowned (and paid) on first view. Idempotent.
  await settleOverdue();

  const challenges = await db.challenge.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { entries: true } },
      winnerEntry: {
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          _count: { select: { votes: true } },
        },
      },
    },
  });

  const now = new Date();
  const open = challenges.filter((c) => isOpen(c, now));
  const finished = challenges.filter((c) => !isOpen(c, now)).slice(0, 12);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Challenges"
        icon="bullseye-arrow"
        accentBg="bg-accent-rust"
        addLabel="Challenge"
        tagline="Dares, contests & sneaky pics"
      >
        <NewChallengeForm />
      </ModuleHeader>

      {challenges.length === 0 ? (
        <EmptyState
          icon="bullseye-arrow"
          title="Nobody's been dared yet"
          hint="Throw out a challenge — photo contest, scavenger find, sneakiest pic. Winner banks 300 coins."
        />
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-accent-rust px-3 py-1 font-display text-sm font-bold uppercase tracking-wider text-white shadow-brutal-sm">
                <PixelIcon name="bullseye-arrow" size={15} />
                Open — get in there
              </h2>
              <ul className="space-y-3">
                {open.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/challenges/${c.id}`}
                      className="brutal-card brutal-press block p-4 no-underline"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-lg font-bold leading-tight">
                          {c.title}
                        </p>
                        {c.deadline && (
                          <Badge className="bg-accent-yellow">{timeLeft(c.deadline)}</Badge>
                        )}
                        <Badge className="bg-paper">
                          {c._count.entries} {c._count.entries === 1 ? "entry" : "entries"}
                        </Badge>
                      </div>
                      {c.description && (
                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-ink/70">
                          {c.description}
                        </p>
                      )}
                      <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/40">
                        thrown by <Avatar name={c.creator.displayName} src={c.creator.avatarUrl} size="sm" />{" "}
                        {c.creator.displayName}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open.length === 0 && (
            <EmptyState
              icon="bullseye-arrow"
              title="No open challenges"
              hint="Everyone's off the hook. Fix that."
            />
          )}

          {finished.length > 0 && (
            <section>
              <h2 className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-accent-yellow px-3 py-1 font-display text-sm font-bold uppercase tracking-wider shadow-brutal-sm">
                <PixelIcon name="trophy" size={15} />
                Recently finished
              </h2>
              <ul className="space-y-3">
                {finished.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/challenges/${c.id}`}
                      className="brutal-card brutal-press block p-4 no-underline opacity-90"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-lg font-bold leading-tight">
                          {c.title}
                        </p>
                        <Badge className="bg-paper">
                          {c._count.entries} {c._count.entries === 1 ? "entry" : "entries"}
                        </Badge>
                      </div>
                      {c.winnerEntry ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm">
                          <PixelIcon name="trophy" size={13} />
                          {c.winnerEntry.user.displayName} won
                          {c.winnerEntry._count.votes > 0
                            ? ` with ${c.winnerEntry._count.votes} vote${
                                c.winnerEntry._count.votes === 1 ? "" : "s"
                              }`
                            : ""}
                        </p>
                      ) : (
                        <p className="mt-2 font-mono text-[10px] uppercase text-ink/40">
                          closed — no entries, no glory
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
