import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";
import type { Turn, WeaponKey } from "@/modules/tanks/engine";

export const gameInclude = {
  challenger: { select: { id: true, displayName: true, avatarUrl: true } },
  opponent: { select: { id: true, displayName: true, avatarUrl: true } },
  turns: { orderBy: { index: "asc" as const } },
} satisfies Prisma.TanksGameInclude;

export type GameWithTurns = Prisma.TanksGameGetPayload<{ include: typeof gameInclude }>;

/** The wire shape both the play page and the polling client consume. */
export function gamePayload(g: GameWithTurns) {
  return {
    id: g.id,
    seed: g.seed,
    status: g.status as "active" | "finished",
    currentPlayerId: g.currentPlayerId,
    winnerId: g.winnerId,
    turnCount: g.turnCount,
    challenger: g.challenger,
    opponent: g.opponent,
    hp: [g.challengerHp, g.opponentHp] as [number, number],
    turns: g.turns.map(
      (t): Turn => ({
        player: t.playerId === g.challengerId ? 0 : 1,
        weapon: t.weapon as WeaponKey,
        angle: t.angle,
        power: t.power,
      })
    ),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export type TanksGamePayload = ReturnType<typeof gamePayload>;

export async function loadGame(id: string): Promise<GameWithTurns> {
  const game = await db.tanksGame.findUnique({ where: { id }, include: gameInclude });
  if (!game) throw new HttpError(404, "Game not found.");
  return game;
}
