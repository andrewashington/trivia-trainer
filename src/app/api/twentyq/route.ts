import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { emitOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { createGameSchema } from "@/modules/twentyq/schema";
import { gameInclude, gamePayload } from "@/modules/twentyq/server";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const games = await db.twentyQuestionsGame.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 40,
    include: gameInclude,
  });
  return NextResponse.json({ games: games.map((g) => gamePayload(g, user.id)) });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { category, secret } = await parseBody(req, createGameSchema);

  const game = await db.$transaction(async (tx) => {
    const created = await tx.twentyQuestionsGame.create({
      data: { hostId: user.id, category, secret },
      include: gameInclude,
    });
    await emitOutbox(tx, "twentyq.created", { hostId: user.id });
    return created;
  });

  return NextResponse.json({ game: gamePayload(game, user.id) }, { status: 201 });
});
