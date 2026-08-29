import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { sessionSubmit } from "@/modules/type/schema";
import { submitSession } from "@/modules/type/service";

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, sessionSubmit);
  const result = await submitSession(user.id, user.displayName, body);
  return NextResponse.json(result, { status: result.replay ? 200 : 201 });
});
