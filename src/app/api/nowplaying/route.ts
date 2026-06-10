import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { nowPlayingInput } from "@/modules/nowplaying/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const items = await db.nowPlayingItem.findMany({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ items });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, nowPlayingInput);

  const item = await withOutbox(
    (tx) =>
      tx.nowPlayingItem.create({
        data: {
          userId: user.id,
          mediaType: data.mediaType,
          title: data.title,
          note: data.note ?? null,
          tmdbId: data.tmdbId ?? null,
          posterPath: data.posterPath ?? null,
          releaseYear: data.releaseYear ?? null,
        },
      }),
    (i) => ({
      type: "nowplaying.updated",
      payload: {
        action: "added",
        itemId: i.id,
        userId: user.id,
        mediaType: i.mediaType,
        title: i.title,
      },
    })
  );

  return NextResponse.json({ item }, { status: 201 });
});
