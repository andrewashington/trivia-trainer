import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";
import { listingPatch } from "@/modules/marketplace/schema";

type Ctx = { params: { id: string } };

async function findListing(id: string) {
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) throw new HttpError(404, "Listing not found.");
  return listing;
}

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findListing(params.id);
  assertCanModify(user, existing.sellerId);
  const data = await parseBody(req, listingPatch);

  const listing = await withOutbox(
    (tx) =>
      tx.listing.update({
        where: { id: existing.id },
        data: {
          ...data,
          // Relisting clears the previous claim.
          ...(data.status === "available"
            ? { claimedById: null, claimedAt: null }
            : {}),
        },
      }),
    (l) => ({
      type: "listing.updated",
      payload: { listingId: l.id, title: l.title, status: l.status, editedBy: user.id },
    })
  );
  return NextResponse.json({ listing });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findListing(params.id);
  assertCanModify(user, existing.sellerId);

  await withOutbox(
    (tx) => tx.listing.delete({ where: { id: existing.id } }),
    () => ({
      type: "listing.deleted",
      payload: { listingId: existing.id, title: existing.title, deletedBy: user.id },
    })
  );
  if (existing.imageKey) {
    deleteObject(existing.imageKey).catch(() => {});
  }
  return NextResponse.json({ ok: true });
});
