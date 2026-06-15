import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { bookBetInput } from "@/modules/book/schema";
import { placeBookBet } from "@/modules/book/place";

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, bookBetInput);
  // All the placement logic (validate, spend, tally, feed-card post/refresh)
  // lives in placeBookBet so the Discord one-tap buttons share it exactly.
  const result = await placeBookBet({
    userId: user.id,
    marketId: input.marketId,
    outcome: input.outcome,
    stake: input.stake,
  });
  return NextResponse.json({ coins: result.coins }, { status: 201 });
});
