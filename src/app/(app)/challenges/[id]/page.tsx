import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { Avatar, Badge } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { ChallengeActions } from "@/modules/challenges/ChallengeActions";
import { EntryCard, type EntryView } from "@/modules/challenges/EntryCard";
import { EntryForm } from "@/modules/challenges/EntryForm";
import { isOpen, settleChallenge } from "@/modules/challenges/lib";
import { CommentThread } from "@/modules/comments/CommentThread";

export const metadata = { title: "Challenge" };
export const dynamic = "force-dynamic";

export default async function ChallengePage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // Lazy settlement: if the deadline passed and nobody settled yet,
  // crown + pay the winner now (idempotent).
  const pre = await db.challenge.findUnique({
    where: { id: params.id },
    select: { settledAt: true, deadline: true },
  });
  if (!pre) notFound();
  if (!pre.settledAt && pre.deadline && pre.deadline.getTime() <= Date.now()) {
    await settleChallenge(params.id);
  }

  const challenge = await db.challenge.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      entries: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          file: { select: { storageKey: true } },
          _count: { select: { votes: true } },
        },
      },
      votes: { where: { voterId: user.id }, select: { entryId: true } },
    },
  });
  if (!challenge) notFound();

  const open = isOpen(challenge);
  const myVote = challenge.votes[0]?.entryId ?? null;
  const myEntry = challenge.entries.find((e) => e.userId === user.id) ?? null;
  const canManage = user.id === challenge.creatorId || user.role === "admin";

  const entries: EntryView[] = await Promise.all(
    challenge.entries.map(async (e): Promise<EntryView> => {
      let photoUrl: string | null = null;
      if (e.file) {
        try {
          photoUrl = await presignView(e.file.storageKey);
        } catch {
          photoUrl = null;
        }
      }
      return {
        id: e.id,
        userId: e.user.id,
        userName: e.user.displayName,
        userAvatarUrl: e.user.avatarUrl,
        text: e.text,
        photoUrl,
        createdAt: e.createdAt.toISOString(),
        voteCount: e._count.votes,
        isMine: e.userId === user.id,
        isWinner: e.id === challenge.winnerEntryId,
      };
    })
  );
  // Closed challenges read like a leaderboard: winner first, then votes.
  const sorted = open
    ? entries
    : [...entries].sort(
        (a, b) => Number(b.isWinner) - Number(a.isWinner) || b.voteCount - a.voteCount
      );

  const winner = entries.find((e) => e.isWinner) ?? null;

  const commentCount = await db.comment.count({
    where: { targetType: "challenge", targetId: challenge.id },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/challenges"
            className="font-mono text-xs font-bold uppercase text-ink/50 no-underline hover:text-accent-rust"
          >
            ← All challenges
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight">
            {challenge.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge className={open ? "bg-accent-green" : "bg-ink text-white"}>
              {open ? "Open" : "Closed"}
            </Badge>
            {challenge.deadline && (
              <Badge className="bg-paper">
                deadline {challenge.deadline.toLocaleString()}
              </Badge>
            )}
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/40">
              thrown by{" "}
              <Link
                href={`/people/${challenge.creator.id}`}
                className="inline-flex items-center gap-1 text-ink/40 no-underline hover:text-accent-rust"
              >
                <Avatar
                  name={challenge.creator.displayName}
                  src={challenge.creator.avatarUrl}
                  size="sm"
                />
                {challenge.creator.displayName}
              </Link>
            </span>
          </div>
        </div>
        <ChallengeActions challengeId={challenge.id} open={open} canManage={canManage} />
      </div>

      {challenge.description && (
        <p className="brutal-card whitespace-pre-wrap p-4 text-sm text-ink/80">
          {challenge.description}
        </p>
      )}

      {!open && (
        <div className="flex items-center gap-3 border-3 border-ink bg-accent-yellow p-4 shadow-brutal">
          <PixelIcon name="trophy" size={28} />
          {winner ? (
            <div>
              <p className="font-display text-xl font-bold leading-tight">
                {winner.userName} takes it!
              </p>
              <p className="font-mono text-xs uppercase text-ink/70">
                {winner.voteCount} vote{winner.voteCount === 1 ? "" : "s"} — 300 coins banked
              </p>
            </div>
          ) : (
            <div>
              <p className="font-display text-xl font-bold leading-tight">
                Closed with no entries
              </p>
              <p className="font-mono text-xs uppercase text-ink/70">
                the coins go unclaimed
              </p>
            </div>
          )}
        </div>
      )}

      {open && !myEntry && (
        <EntryForm
          challengeId={challenge.id}
          maxMb={Number(process.env.MAX_FILE_SIZE_MB ?? 25)}
        />
      )}

      <section>
        <h2 className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-accent-rust px-3 py-1 font-display text-sm font-bold uppercase tracking-wider text-white shadow-brutal-sm">
          <PixelIcon name="users" size={15} />
          Entries ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="brutal-card p-4 text-sm text-ink/60">
            No entries yet. {open ? "Be the first — easy coins." : ""}
          </p>
        ) : (
          <>
            {open && (
              <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-ink/50">
                Vote for the best entry — one vote, changeable, no self-votes.
              </p>
            )}
            <ul className="space-y-3">
              {sorted.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  challengeId={challenge.id}
                  open={open}
                  myVote={myVote}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="brutal-card p-4">
        <CommentThread
          targetType="challenge"
          targetId={challenge.id}
          initialCount={commentCount}
          viewerId={user.id}
          viewerIsAdmin={user.role === "admin"}
        />
      </div>
    </div>
  );
}
