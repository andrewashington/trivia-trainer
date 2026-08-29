import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/session";
import { utcDateKey } from "@/modules/type/engine";
import { dailyWords, getOrCreateDaily, isPlaced } from "@/modules/type/service";

export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  if (!(await isPlaced(user.id))) throw new HttpError(403, "placement_required");
  const date = new URL(req.url).searchParams.get("date") ?? utcDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Bad date.");
  const daily = await getOrCreateDaily(date);
  return NextResponse.json({ date: daily.date, kind: daily.kind, words: dailyWords(daily) });
});
