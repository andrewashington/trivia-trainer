import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";
import { QUESTION_BUDGET, type Answer, type Category } from "@/modules/twentyq/schema";

const who = { select: { id: true, displayName: true, avatarUrl: true } };

export const gameInclude = {
  host: who,
  winner: who,
  entries: { orderBy: { createdAt: "asc" as const }, include: { asker: who } },
} satisfies Prisma.TwentyQuestionsGameInclude;

export type GameWithEntries = Prisma.TwentyQuestionsGameGetPayload<{
  include: typeof gameInclude;
}>;

export async function loadGame(id: string): Promise<GameWithEntries> {
  const game = await db.twentyQuestionsGame.findUnique({ where: { id }, include: gameInclude });
  if (!game) throw new HttpError(404, "That round vanished.");
  return game;
}

export type GameStatus = "active" | "solved" | "revealed";

/**
 * The wire shape the lobby + play client consume. The `secret` is stripped
 * while the round is active — it only rides along once solved/revealed.
 */
export function gamePayload(g: GameWithEntries, meId: string) {
  const over = g.status !== "active";
  const isHost = g.hostId === meId;
  return {
    id: g.id,
    category: g.category as Category,
    status: g.status as GameStatus,
    answered: g.answered,
    budget: QUESTION_BUDGET,
    remaining: Math.max(0, QUESTION_BUDGET - g.answered),
    isHost,
    host: g.host,
    winner: g.winner,
    // NEVER expose the secret while the round is live.
    secret: over ? g.secret : null,
    createdAt: g.createdAt.toISOString(),
    endedAt: g.endedAt?.toISOString() ?? null,
    entries: g.entries.map((e) => ({
      id: e.id,
      kind: e.kind as "question" | "guess",
      text: e.text,
      answer: (e.answer as Answer | null) ?? null,
      correct: e.correct,
      asker: e.asker,
      mine: e.askerId === meId,
      // A question is "pending" until the host answers it.
      pending: e.kind === "question" ? e.answer === null : e.correct === null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export type TwentyQGamePayload = ReturnType<typeof gamePayload>;
export type TwentyQEntryPayload = TwentyQGamePayload["entries"][number];
