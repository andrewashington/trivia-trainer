import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { withOutbox } from "@/lib/outbox";
import { getEffectiveOutfit } from "@/modules/world/content";

const purchaseInput = z.object({
  kind: z.literal("outfit"),
  itemKey: z.string().regex(/^\d{2}$/),
});

/**
 * POST /api/world/shop/purchase — buy a cosmetic for coins.
 * Transaction-safe: balance re-checked and debited in the same tx that
 * writes the ledger entry and the ownership row.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { kind, itemKey } = await parseBody(req, purchaseInput);

  const item = await getEffectiveOutfit(itemKey);
  if (!item) throw new HttpError(404, "That isn't for sale. Flattered you asked.");

  const result = await withOutbox(
    async (tx) => {
      const existing = await tx.worldOwnedCosmetic.findUnique({
        where: { userId_kind_itemKey: { userId: user.id, kind, itemKey } },
      });
      if (existing) throw new HttpError(409, "You already own that. Bold of you to try paying twice.");

      const me = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (me.coins < item.price) {
        throw new HttpError(400, `${item.name} costs ${item.price} coins — you have ${me.coins}.`);
      }

      await tx.coinTransaction.create({
        data: {
          userId: user.id,
          amount: -item.price,
          reason: "world.cosmetic.purchased",
          meta: { label: `Bought "${item.name}"`, kind, itemKey },
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { coins: { decrement: item.price } },
      });
      await tx.worldOwnedCosmetic.create({
        data: { userId: user.id, kind, itemKey },
      });
      return { coins: me.coins - item.price };
    },
    () => ({
      type: "world.cosmetic.purchased",
      payload: { userId: user.id, kind, itemKey, name: item.name, price: item.price },
    })
  );

  return NextResponse.json({ ok: true, coins: result.coins });
});
