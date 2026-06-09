import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { mapPinInput } from "@/modules/map/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const pins = await db.mapPin.findMany({
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ pins });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, mapPinInput);

  const pin = await withOutbox(
    (tx) =>
      tx.mapPin.create({
        data: {
          creatorId: user.id,
          name: data.name,
          category: data.category,
          lat: data.lat,
          lng: data.lng,
          address: data.address ?? null,
          note: data.note ?? null,
        },
      }),
    (p) => ({
      type: "map.pin.added",
      payload: { pinId: p.id, name: p.name, category: p.category, addedBy: user.id },
    })
  );

  return NextResponse.json({ pin }, { status: 201 });
});
