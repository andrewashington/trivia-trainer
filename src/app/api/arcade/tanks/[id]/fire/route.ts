import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  ammoLeft,
  applyTurn,
  replay,
  type Turn,
  type WeaponKey,
} from "@/modules/tanks/engine";
import { gameInclude, gamePayload, loadGame } from "@/modules/tanks/server";

const fireInput = z.object({
  weapon: z.enum(["shell", "bigone", "triple"]),
  angle: z.number().min(0).max(180),
  power: z.number().min(10).max(100),
});

type Ctx = { params: { id: string } };

export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const data = await parseBody(req, fireInput);
  const game = await loadGame(params.id);

  if (game.status !== "active") throw new HttpError(400, "This duel is already over.");
  if (game.challengerId !== user.id && game.opponentId !== user.id)
    throw new HttpError(403, "Not your duel.");
  if (game.currentPlayerId !== user.id) throw new HttpError(409, "Not your turn.");

  const me: 0 | 1 = game.challengerId === user.id ? 0 : 1;
  const priorTurns: Turn[] = game.turns.map((t) => ({
    player: t.playerId === game.challengerId ? 0 : 1,
    weapon: t.weapon as WeaponKey,
    angle: t.angle,
    power: t.power,
  }));

  const left = ammoLeft(priorTurns, me, data.weapon);
  if (left !== null && left <= 0) throw new HttpError(400, "Out of ammo for that weapon.");

  // Authoritative physics: replay the match, then apply this shot.
  const state = replay(game.seed, priorTurns);
  const turn: Turn = { player: me, weapon: data.weapon, angle: data.angle, power: data.power };
  applyTurn(state, game.seed, priorTurns.length, turn);

  const opponentIdx = me === 0 ? 1 : 0;
  const opponentDead = state.hp[opponentIdx] <= 0;
  const selfDead = state.hp[me] <= 0;
  // Killing yourself without taking them out hands them the win.
  const finished = opponentDead || selfDead;
  const winnerIdx = finished ? (opponentDead ? me : opponentIdx) : null;
  const ids = [game.challengerId, game.opponentId] as const;
  const names = [game.challenger.displayName, game.opponent.displayName] as const;

  const nextPlayerId = ids[opponentIdx];

  const updated = await db.$transaction(async (tx) => {
    // The unique (gameId, index) constraint makes a double-submit a 500
    // instead of a duplicated shot — acceptable for a friendly duel.
    await tx.tanksTurn.create({
      data: {
        gameId: game.id,
        playerId: user.id,
        index: priorTurns.length,
        weapon: data.weapon,
        angle: data.angle,
        power: data.power,
      },
    });
    const g = await tx.tanksGame.update({
      where: { id: game.id },
      data: {
        challengerHp: state.hp[0],
        opponentHp: state.hp[1],
        turnCount: priorTurns.length + 1,
        currentPlayerId: finished ? game.currentPlayerId : nextPlayerId,
        status: finished ? "finished" : "active",
        winnerId: winnerIdx === null ? null : ids[winnerIdx],
        finishedAt: finished ? new Date() : null,
      },
      include: gameInclude,
    });
    if (finished && winnerIdx !== null) {
      await tx.outboxEvent.create({
        data: {
          type: "arcade.tanks.finished",
          payload: {
            gameId: game.id,
            winnerId: ids[winnerIdx],
            winner: names[winnerIdx],
            loserId: ids[winnerIdx === 0 ? 1 : 0],
            loser: names[winnerIdx === 0 ? 1 : 0],
            turns: priorTurns.length + 1,
          },
        },
      });
    }
    return g;
  });

  return NextResponse.json({ game: gamePayload(updated) });
});
