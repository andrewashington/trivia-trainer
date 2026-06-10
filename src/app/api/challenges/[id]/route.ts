import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

// Delete a challenge (creator or admin). Entries/votes cascade; any
// uploaded proof FileObjects stay in the shared files table.
export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const challenge = await db.challenge.findUnique({ where: { id: params.id } });
  if (!challenge) throw new HttpError(404, "Challenge not found.");
  assertCanModify(user, challenge.creatorId);

  await db.challenge.delete({ where: { id: challenge.id } });
  return NextResponse.json({ ok: true });
});
