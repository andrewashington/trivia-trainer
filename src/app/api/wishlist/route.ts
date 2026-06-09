import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { wishlistItemInput } from "@/modules/wishlist/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const items = await db.wishlistItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, wishlistItemInput);

  const item = await withOutbox(
    (tx) =>
      tx.wishlistItem.create({
        data: {
          userId: user.id,
          title: data.title,
          url: data.url ?? null,
          imageUrl: data.imageUrl ?? null,
          siteName: data.siteName ?? null,
          note: data.note ?? null,
        },
      }),
    (i) => ({
      type: "wishlist.added",
      payload: { itemId: i.id, userId: user.id, title: i.title },
    })
  );

  return NextResponse.json({ item }, { status: 201 });
});
