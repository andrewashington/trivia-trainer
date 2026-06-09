import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

// Claim: atomic first-come-first-served. The status guard inside
// updateMany means two simultaneous claims can't both win — the loser
// gets a clean 409 instead of a double-sold toaster.
export const POST = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const listing = await db.listing.findUnique({ where: { id: params.id } });
  if (!listing) throw new HttpError(404, "Listing not found.");
  if (listing.sellerId === user.id) {
    throw new HttpError(400, "You can't claim your own listing.");
  }

  await withOutbox(
    async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id: listing.id, status: "available" },
        data: { status: "claimed", claimedById: user.id, claimedAt: new Date() },
      });
      if (count === 0) {
        throw new HttpError(409, "Too slow — someone already claimed it.");
      }
    },
    () => ({
      type: "listing.claimed",
      payload: { listingId: listing.id, title: listing.title, claimedBy: user.id },
    })
  );

  return NextResponse.json({ ok: true });
});

// Unclaim: the claimer backing out, or the seller/admin releasing it.
export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const listing = await db.listing.findUnique({ where: { id: params.id } });
  if (!listing) throw new HttpError(404, "Listing not found.");
  if (listing.status !== "claimed") {
    throw new HttpError(409, "Nothing to unclaim.");
  }
  const allowed =
    user.id === listing.claimedById ||
    user.id === listing.sellerId ||
    user.role === "admin";
  if (!allowed) throw new HttpError(403, "Not your claim to release.");

  await withOutbox(
    (tx) =>
      tx.listing.update({
        where: { id: listing.id },
        data: { status: "available", claimedById: null, claimedAt: null },
      }),
    () => ({
      type: "listing.unclaimed",
      payload: { listingId: listing.id, title: listing.title, releasedBy: user.id },
    })
  );

  return NextResponse.json({ ok: true });
});
