import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/session";
import { withOutbox } from "@/lib/outbox";
import { creditWinnings } from "@/modules/arcade/bank";

const sellInput = z.object({ ownedId: z.string().min(1) });

/** 50% of the catalog price comes back when you sell. Decorating stays low-stakes. */
const BUYBACK_RATE = 0.5;

/**
 * POST /api/world/house/sell — sell one owned furniture item back for half
 * its price. Delete the ownership row + credit the refund in one tx (so a
 * double-click can't refund twice). Scoped to the caller's own rows.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { ownedId } = await parseBody(req, sellInput);

  const result = await withOutbox(
    async (tx) => {
      const owned = await tx.worldOwnedItem.findFirst({
        where: { id: ownedId, userId: user.id },
        include: { item: true },
      });
      if (!owned) throw new HttpError(404, "You don't own that. Can't sell what isn't yours.");

      const refund = Math.floor(owned.item.price * BUYBACK_RATE);
      // Delete first so a concurrent sell of the same row credits at most once.
      const del = await tx.worldOwnedItem.deleteMany({
        where: { id: ownedId, userId: user.id },
      });
      if (del.count === 0) throw new HttpError(409, "Already sold. The fence works fast.");

      await creditWinnings(
        tx,
        user.id,
        refund,
        "world.furniture.sold",
        `Sold "${owned.item.name}"`,
        { itemId: owned.itemId, itemKey: owned.item.key, refund }
      );
      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { coins: true },
      });
      return { coins: me.coins, refund, name: owned.item.name, itemId: owned.itemId };
    },
    (r) => ({
      type: "world.furniture.sold",
      payload: { userId: user.id, ownedId, itemId: r.itemId, refund: r.refund },
    })
  );

  return NextResponse.json({ ok: true, coins: result.coins, refund: result.refund });
});
