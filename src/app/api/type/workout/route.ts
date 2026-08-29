import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getOrCreateWorkout } from "@/modules/type/service";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const workout = await getOrCreateWorkout(user.id);
  return NextResponse.json(workout);
});
