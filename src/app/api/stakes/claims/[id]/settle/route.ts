import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

// Mark the staked favor as delivered. Either party (or admin) can do it.
export const POST = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const claim = await db.claim.findUnique({ where: { id: params.id } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  if (!claim.stake || claim.outcome === null || claim.outcome === "void") {
    throw new HttpError(409, "Nothing owed on this one.");
  }
  if (claim.settledAt) throw new HttpError(409, "Already settled.");
  const isParty = user.id === claim.creatorId || user.id === claim.counterpartyId;
  if (!isParty && user.role !== "admin") {
    throw new HttpError(403, "Not your tab to settle.");
  }

  await withOutbox(
    (tx) => tx.claim.update({ where: { id: claim.id }, data: { settledAt: new Date() } }),
    () => ({
      type: "claim.settled",
      payload: { claimId: claim.id, stake: claim.stake, settledBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
