import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { resolveInput } from "@/modules/stakes/schema";

type Ctx = { params: { id: string } };

async function findClaim(id: string) {
  const claim = await db.claim.findUnique({ where: { id } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  return claim;
}

/**
 * Resolution. Self-reported by either party (one shot), with admin
 * override for disputes. The claim text/date stay immutable forever —
 * only status fields change.
 */
export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const claim = await findClaim(params.id);
  const { outcome } = await parseBody(req, resolveInput);

  const isParty = user.id === claim.creatorId || user.id === claim.counterpartyId;
  const isAdmin = user.role === "admin";
  if (!isParty && !isAdmin) {
    throw new HttpError(403, "Only the people in the claim (or an admin) resolve it.");
  }
  if (claim.outcome !== null && !isAdmin) {
    throw new HttpError(409, "Already resolved — disputes go to the admin.");
  }

  const updated = await withOutbox(
    (tx) =>
      tx.claim.update({
        where: { id: claim.id },
        data: { outcome, resolvedAt: new Date(), resolvedById: user.id },
      }),
    (c) => ({
      type: "claim.resolved",
      payload: {
        claimId: c.id,
        text: c.text, // resolution reveals hidden claims
        outcome,
        resolvedBy: user.id,
        override: claim.outcome !== null,
      },
    })
  );
  return NextResponse.json({ claim: updated });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const claim = await findClaim(params.id);
  assertCanModify(user, claim.creatorId);

  await withOutbox(
    (tx) => tx.claim.delete({ where: { id: claim.id } }),
    () => ({
      type: "claim.deleted",
      payload: { claimId: claim.id, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
