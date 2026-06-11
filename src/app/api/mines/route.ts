import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import {
  validateBet,
  debitStake,
  placeMines,
} from "@/modules/arcade/bank";
import { startInput } from "@/modules/mines/schema";
import { toMinesView, getUserCoins } from "@/modules/mines/server";

/** GET: return the user's current active game (mines hidden) or { game: null }. */
export const GET = apiHandler(async () => {
  const user = await requireUser();

  const game = await db.minesGame.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!game) {
    const coins = await getUserCoins(user.id);
    return NextResponse.json({ game: null, coins });
  }

  const coins = await getUserCoins(user.id);
  return NextResponse.json({ game: toMinesView(game, coins) });
});

/** POST: start a new round. Debits stake, places mines, creates the game row. */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, startInput);
  const bet = validateBet(body.bet);
  const { mineCount } = body;

  let gameId: string | null = null;

  await db.$transaction(async (tx) => {
    // Reject if there's already an active round
    const existing = await tx.minesGame.findFirst({
      where: { userId: user.id, status: "active" },
      select: { id: true },
    });
    if (existing) throw new HttpError(409, "You already have an active Mines round.");

    // Debit the stake (also validates sufficient balance)
    await debitStake(tx, user.id, bet, "mines.bet", "Mines bet");

    // Place mines server-side
    const mines = placeMines(mineCount);

    // Create the game row
    const game = await tx.minesGame.create({
      data: {
        userId: user.id,
        stake: bet,
        mineCount,
        mines,
        revealed: [],
        status: "active",
        multiplier: 1,
      },
    });
    gameId = game.id;
  });

  // Fetch the created game and coins outside the transaction
  const game = await db.minesGame.findUniqueOrThrow({ where: { id: gameId! } });
  const coins = await getUserCoins(user.id);
  return NextResponse.json({ game: toMinesView(game, coins) });
});
