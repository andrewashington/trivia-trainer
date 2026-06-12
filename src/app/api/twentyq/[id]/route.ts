import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { gamePayload, loadGame } from "@/modules/twentyq/server";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const game = await loadGame(id);
  return NextResponse.json({ game: gamePayload(game, user.id) });
});
