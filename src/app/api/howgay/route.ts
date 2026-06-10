import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { gayPercent, todayKey } from "@/modules/howgay/lib";

/**
 * Take (or re-view) today's reading. Deterministic per user per day —
 * the first press of the day writes the row and fires the outbox
 * event; every later press just returns the same number.
 */
export const POST = apiHandler(async () => {
  const user = await requireUser();
  const date = todayKey();
  const percent = gayPercent(user.id, date);

  const existing = await db.gayReading.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  if (existing) {
    return NextResponse.json({ percent: existing.percent, alreadyChecked: true });
  }

  await withOutbox(
    (tx) => tx.gayReading.create({ data: { userId: user.id, date, percent } }),
    () => ({
      type: "howgay.checked",
      payload: { userId: user.id, displayName: user.displayName, percent, date },
    })
  );

  return NextResponse.json({ percent, alreadyChecked: false });
});
