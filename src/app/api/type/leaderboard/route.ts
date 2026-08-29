import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/session";
import { utcDateKey } from "@/modules/type/engine";
import { getLeaderboard, isPlaced } from "@/modules/type/service";

export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  if (!(await isPlaced(user.id))) throw new HttpError(403, "placement_required");
  const q = new URL(req.url).searchParams;
  const board = q.get("board") === "alltime" ? "alltime" : "daily";
  const date = q.get("date") ?? utcDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Bad date.");
  const rows = await getLeaderboard(board, date);
  return NextResponse.json({ board, date, rows });
});
