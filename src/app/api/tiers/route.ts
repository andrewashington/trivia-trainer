import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { tierListInput } from "@/modules/tiers/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const lists = await db.tierList.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true } },
      items: { select: { id: true } },
      placements: { select: { userId: true } },
    },
  });
  return NextResponse.json({
    lists: lists.map(({ items, placements, ...l }) => ({
      ...l,
      itemCount: items.length,
      rankedBy: [...new Set(placements.map((p) => p.userId))].length,
    })),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, tierListInput);

  // De-dupe labels (case-insensitive) so the board never has twins.
  const seen = new Set<string>();
  const labels = data.items.filter((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const list = await withOutbox(
    (tx) =>
      tx.tierList.create({
        data: {
          creatorId: user.id,
          title: data.title,
          description: data.description ?? null,
          items: {
            create: labels.map((label, i) => ({ label, position: i })),
          },
        },
      }),
    (l) => ({
      type: "tierlist.created",
      payload: { listId: l.id, title: l.title, creatorId: user.id, itemCount: labels.length },
    })
  );

  return NextResponse.json({ list }, { status: 201 });
});
