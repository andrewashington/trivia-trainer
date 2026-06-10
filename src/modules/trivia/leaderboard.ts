import { db } from "@/lib/db";

export type TriviaLeaderRow = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  best: number;
  plays: number;
};

export type TriviaBoard = {
  rows: TriviaLeaderRow[];
  totalPlays: number;
  myBest: number | null;
};

/**
 * The Trivia board: each player's best round (out of 10), ranked.
 * Computed at request time, same shape as the Snake board.
 */
export async function getTriviaBoard(meId: string): Promise<TriviaBoard> {
  const grouped = await db.arcadeScore.groupBy({
    by: ["userId"],
    where: { game: "trivia" },
    _max: { score: true },
    _count: { _all: true },
  });

  const users = await db.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: TriviaLeaderRow[] = grouped
    .map((g) => {
      const u = byId.get(g.userId);
      return {
        userId: g.userId,
        displayName: u?.displayName ?? "Someone",
        avatarUrl: u?.avatarUrl ?? null,
        best: g._max.score ?? 0,
        plays: g._count._all,
      };
    })
    .sort((a, b) => b.best - a.best);

  const totalPlays = rows.reduce((sum, r) => sum + r.plays, 0);
  const myBest = rows.find((r) => r.userId === meId)?.best ?? null;

  return { rows, totalPlays, myBest };
}
