import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser, assertCanModify } from "@/lib/session";

export const DELETE = apiHandler(
  async (_req: Request, { params }: { params: { id: string } }) => {
    const user = await requireUser();
    const countdown = await db.countdown.findUnique({ where: { id: params.id } });
    if (!countdown) throw new HttpError(404, "Countdown not found.");
    assertCanModify(user, countdown.creatorId);

    await withOutbox(
      (tx) => tx.countdown.delete({ where: { id: countdown.id } }),
      () => ({
        type: "countdown.deleted",
        payload: { countdownId: countdown.id, title: countdown.title, deletedBy: user.id },
      })
    );

    return NextResponse.json({ ok: true });
  }
);
