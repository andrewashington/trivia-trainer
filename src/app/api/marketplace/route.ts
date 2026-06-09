import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { listingInput } from "@/modules/marketplace/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const listings = await db.listing.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      seller: { select: { id: true, displayName: true, venmoHandle: true } },
      claimedBy: { select: { id: true, displayName: true } },
    },
  });
  return NextResponse.json({ listings });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, listingInput);

  const listing = await withOutbox(
    (tx) =>
      tx.listing.create({
        data: {
          sellerId: user.id,
          title: data.title,
          description: data.description ?? null,
          priceCents: data.priceCents ?? null,
          delivery: data.delivery,
          imageKey: data.imageKey ?? null,
        },
      }),
    (l) => ({
      type: "listing.created",
      payload: {
        listingId: l.id,
        title: l.title,
        priceCents: l.priceCents,
        sellerId: user.id,
      },
    })
  );

  return NextResponse.json({ listing }, { status: 201 });
});
