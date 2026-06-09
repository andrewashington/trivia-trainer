import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { spinInput } from "@/modules/stakes/schema";

// Spin the wheel: server-side randomness, permanently recorded.
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { targetId, reason } = await parseBody(req, spinInput);

  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw new HttpError(404, "Target not found.");
  const forfeits = await db.forfeit.findMany();
  if (forfeits.length === 0) {
    throw new HttpError(409, "The forfeit pool is empty — write some dares first.");
  }

  const chosen = forfeits[randomInt(forfeits.length)];
  const spin = await withOutbox(
    (tx) =>
      tx.forfeitSpin.create({
        data: {
          forfeitId: chosen.id,
          targetId,
          spunById: user.id,
          reason: reason ?? null,
        },
        include: {
          forfeit: { select: { text: true } },
          target: { select: { displayName: true } },
        },
      }),
    (s) => ({
      type: "forfeit.spun",
      payload: {
        spinId: s.id,
        forfeit: chosen.text,
        targetId,
        spunBy: user.id,
        reason: reason ?? null,
      },
    })
  );

  return NextResponse.json({ spin }, { status: 201 });
});
