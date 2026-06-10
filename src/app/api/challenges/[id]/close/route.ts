import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { isOpen, settleChallenge } from "@/modules/challenges/lib";

type Ctx = { params: { id: string } };

// Manual close (creator or admin): stamp closedAt, then settle — the
// most-voted entry wins and banks the coins. Settlement is idempotent,
// so racing a lazy deadline-settle is harmless.
export const POST = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const challenge = await db.challenge.findUnique({ where: { id: params.id } });
  if (!challenge) throw new HttpError(404, "Challenge not found.");
  assertCanModify(user, challenge.creatorId);
  if (!isOpen(challenge)) throw new HttpError(409, "Already closed.");

  await db.challenge.update({
    where: { id: challenge.id },
    data: { closedAt: new Date() },
  });
  await settleChallenge(challenge.id);

  return NextResponse.json({ ok: true });
});
