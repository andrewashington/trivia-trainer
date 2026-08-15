import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { fitnessLogInput } from "@/modules/fitness/schema";
import { logWorkout } from "@/modules/fitness/service";

// A session happened. First log of the (group-tz) day carries the coin
// event; the third distinct day in a week fires WEEK CONQUERED.
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = await parseBody(req, fitnessLogInput);
  const result = await logWorkout(user.id, input);
  return NextResponse.json(result, { status: 201 });
});
