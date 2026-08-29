import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getMe } from "@/modules/type/service";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const me = await getMe(user.id);
  return NextResponse.json(me);
});
