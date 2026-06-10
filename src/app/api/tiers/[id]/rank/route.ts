import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { rankingInput } from "@/modules/tiers/schema";

/**
 * Save (replace) the caller's whole ranking for a list in one POST.
 * Items left unranked simply have no placement row.
 */
export const POST = apiHandler(
  async (req: Request, { params }: { params: { id: string } }) => {
    const user = await requireUser();
    const data = await parseBody(req, rankingInput);

    const list = await db.tierList.findUnique({
      where: { id: params.id },
      include: { items: { select: { id: true } } },
    });
    if (!list) throw new HttpError(404, "Tier list not found.");

    const validIds = new Set(list.items.map((i) => i.id));
    const placements = data.placements.filter((p) => validIds.has(p.itemId));
    if (placements.length === 0) throw new HttpError(400, "No valid items in that ranking.");

    const hadRanked =
      (await db.tierPlacement.count({ where: { listId: list.id, userId: user.id } })) > 0;

    await withOutbox(
      async (tx) => {
        await tx.tierPlacement.deleteMany({ where: { listId: list.id, userId: user.id } });
        await tx.tierPlacement.createMany({
          data: placements.map((p) => ({
            listId: list.id,
            itemId: p.itemId,
            userId: user.id,
            tier: p.tier,
            position: p.position,
          })),
        });
      },
      () => ({
        type: "tierlist.ranked",
        payload: {
          listId: list.id,
          title: list.title,
          userId: user.id,
          rankedCount: placements.length,
          firstTime: !hadRanked,
        },
      })
    );

    return NextResponse.json({ ok: true });
  }
);
