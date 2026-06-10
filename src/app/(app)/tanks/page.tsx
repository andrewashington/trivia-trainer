import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { ChallengeForm } from "@/modules/tanks/ChallengeForm";
import { MAX_HP } from "@/modules/tanks/engine";

export const metadata = { title: "Tanks" };
export const dynamic = "force-dynamic";

const who = { select: { id: true, displayName: true, avatarUrl: true } };
const MEDALS = ["bg-accent-yellow", "bg-paper", "bg-accent-orange"];

export default async function TanksPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const [members, active, finished] = await Promise.all([
    db.user.findMany({
      where: { id: { not: user.id } },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    db.tanksGame.findMany({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
      include: { challenger: who, opponent: who },
    }),
    db.tanksGame.findMany({
      where: { status: "finished" },
      orderBy: { finishedAt: "desc" },
      take: 8,
      include: { challenger: who, opponent: who, winner: who },
    }),
  ]);

  // Wins board, computed on the fly like the other arcade boards.
  const winRows = await db.tanksGame.groupBy({
    by: ["winnerId"],
    where: { status: "finished", winnerId: { not: null } },
    _count: { _all: true },
  });
  const winners = await db.user.findMany({
    where: { id: { in: winRows.map((r) => r.winnerId!).filter(Boolean) } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const board = winRows
    .map((r) => ({
      user: winners.find((u) => u.id === r.winnerId)!,
      wins: r._count._all,
    }))
    .filter((r) => r.user)
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 8);

  // Your duels first, your-turn first within those.
  const sorted = [...active].sort((a, b) => {
    const aMine = a.challengerId === user.id || a.opponentId === user.id ? 1 : 0;
    const bMine = b.challengerId === user.id || b.opponentId === user.id ? 1 : 0;
    if (aMine !== bMine) return bMine - aMine;
    const aTurn = a.currentPlayerId === user.id ? 1 : 0;
    const bTurn = b.currentPlayerId === user.id ? 1 : 0;
    return bTurn - aTurn;
  });

  const yourTurnCount = active.filter((g) => g.currentPlayerId === user.id).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Tanks"
        icon="zap"
        accentBg="bg-accent-orange"
        action={
          yourTurnCount > 0 ? (
            <Badge className="bg-accent-orange">
              {yourTurnCount} duel{yourTurnCount === 1 ? "" : "s"} waiting on you
            </Badge>
          ) : undefined
        }
      />

      <Card>
        <p className="brutal-label">New duel</p>
        <p className="mb-3 text-sm text-ink/60">
          One shot per turn, on your own time. Wind shifts every turn and the terrain keeps every
          crater.
        </p>
        <ChallengeForm members={members} />
      </Card>

      <Card>
        <p className="brutal-label mb-3">Live duels</p>
        {sorted.length === 0 ? (
          <EmptyState icon="zap" title="No duels in progress" hint="Challenge someone above." />
        ) : (
          <ul className="space-y-2">
            {sorted.map((g) => {
              const mine = g.challengerId === user.id || g.opponentId === user.id;
              const yourTurn = g.currentPlayerId === user.id;
              return (
                <li key={g.id}>
                  <Link
                    href={`/tanks/${g.id}`}
                    className={`flex items-center gap-3 border-3 border-ink px-3 py-2 no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5 ${
                      yourTurn ? "bg-accent-orange/25" : "bg-paper"
                    }`}
                  >
                    <Avatar name={g.challenger.displayName} src={g.challenger.avatarUrl} size="sm" />
                    <span className="font-mono text-[10px] font-bold uppercase text-ink/50">vs</span>
                    <Avatar name={g.opponent.displayName} src={g.opponent.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-bold">{g.challenger.displayName.split(" ")[0]}</span>{" "}
                      <span className="font-mono text-xs tabular-nums text-ink/60">
                        {g.challengerHp}/{MAX_HP}
                      </span>{" "}
                      · <span className="font-bold">{g.opponent.displayName.split(" ")[0]}</span>{" "}
                      <span className="font-mono text-xs tabular-nums text-ink/60">
                        {g.opponentHp}/{MAX_HP}
                      </span>
                    </span>
                    <Badge
                      className={
                        yourTurn ? "bg-accent-orange" : mine ? "bg-paper" : "bg-card text-ink/50"
                      }
                    >
                      {yourTurn ? "Your shot" : mine ? "Their shot" : "Watch"}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <p className="brutal-label mb-3">Hall of victors</p>
        {board.length === 0 ? (
          <p className="text-sm text-ink/60">Nobody has won a duel yet. History awaits.</p>
        ) : (
          <ol className="space-y-2">
            {board.map((row, i) => (
              <li
                key={row.user.id}
                className={`flex items-center gap-3 border-3 border-ink px-3 py-2 shadow-brutal-sm ${
                  row.user.id === user.id ? "bg-accent-orange/20" : "bg-paper"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink font-display text-sm font-bold ${
                    MEDALS[i] ?? "bg-card"
                  }`}
                >
                  {i === 0 ? <PixelIcon name="crown" size={16} /> : i + 1}
                </span>
                <Avatar name={row.user.displayName} src={row.user.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-display font-bold">
                  {row.user.displayName}
                  {row.user.id === user.id && <span className="text-ink/40"> (you)</span>}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                  {row.wins} win{row.wins === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {finished.length > 0 && (
        <Card>
          <p className="brutal-label mb-3">Recent battles</p>
          <ul className="space-y-1.5">
            {finished.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/tanks/${g.id}`}
                  className="flex items-center gap-2 border-2 border-ink bg-paper px-3 py-1.5 text-sm no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                >
                  <PixelIcon name="trophy" size={14} className="shrink-0 text-ink/50" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold">{g.winner?.displayName ?? "Nobody"}</span>
                    <span className="text-ink/60"> beat </span>
                    <span className="font-bold">
                      {g.winnerId === g.challengerId
                        ? g.opponent.displayName
                        : g.challenger.displayName}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-ink/40">
                    {g.turnCount} shots
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="font-mono text-[11px] leading-relaxed text-ink/40">
        The whole battle replays from its seed — open a finished duel to watch the carnage again.
        Every finished duel feeds the pet.
      </p>
    </div>
  );
}
