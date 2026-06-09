import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";

// The one optional input: a pat. One per person per day — it's a
// gentle nudge, not a feeding chore.
export const POST = apiHandler(async () => {
  const user = await requireUser();
  const since = new Date(Date.now() - 86_400_000);
  const already = await db.petNudge.count({
    where: { userId: user.id, createdAt: { gte: since } },
  });
  if (already > 0) {
    throw new HttpError(409, "You already patted today — share the love tomorrow.");
  }

  await withOutbox(
    (tx) => tx.petNudge.create({ data: { userId: user.id } }),
    () => ({ type: "pet.nudged", payload: { by: user.id } })
  );
  return NextResponse.json({ ok: true }, { status: 201 });
});
