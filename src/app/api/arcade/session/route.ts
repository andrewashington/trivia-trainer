import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const sessionInput = z.object({
  game: z.string().min(1).max(32),
});

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — enough for any real game

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { game } = await parseBody(req, sessionInput);

  const session = await db.gameSession.create({
    data: {
      userId: user.id,
      game,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return NextResponse.json({ sessionId: session.id }, { status: 201 });
});
