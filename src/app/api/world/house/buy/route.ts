import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { withOutbox } from "@/lib/outbox";
import { spendCoins } from "@/modules/arcade/bank";
import { payloadFromItem } from "@/modules/world/furniture";

const buyInput = z.object({ itemId: z.string().min(1) });

/**
 * POST /api/world/house/buy — buy one furniture item into storage.
 * Mirrors the cosmetics purchase: balance debited + ledger entry +
 * ownership row, all in one transaction (so a racing double-click can't
 * over-spend). The new item lands in inventory (x/y null) for the player
 * to place in decorate mode. Multiples are allowed — buy four chairs.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { itemId } = await parseBody(req, buyInput);

  const item = await db.worldItem.findUnique({ where: { id: itemId } });
  if (!item || !item.published || item.availability !== "shop" || item.price <= 0) {
    throw new HttpError(404, "That isn't for sale. Flattered you asked.");
  }

  const result = await withOutbox(
    async (tx) => {
      await spendCoins(
        tx,
        user.id,
        item.price,
        "world.furniture.purchased",
        `Bought "${item.name}"`,
        `${item.name} costs ${item.price} coins. The bank says no.`,
        { itemId: item.id, itemKey: item.key }
      );
      const owned = await tx.worldOwnedItem.create({
        data: { userId: user.id, itemId: item.id },
      });
      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { coins: true },
      });
      return { coins: me.coins, ownedId: owned.id };
    },
    () => ({
      type: "world.furniture.purchased",
      payload: { userId: user.id, itemId: item.id, name: item.name, price: item.price },
    })
  );

  return NextResponse.json({
    ok: true,
    coins: result.coins,
    owned: {
      ...payloadFromItem(item, result.ownedId),
      itemId: item.id,
      itemKey: item.key,
      placed: false,
      x: null,
      y: null,
      rotation: 0,
    },
  });
});
