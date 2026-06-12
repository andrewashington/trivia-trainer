import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/session";
import { withOutbox } from "@/lib/outbox";
import { spendCoins } from "@/modules/arcade/bank";
import { getHousePrice } from "@/modules/world/content";
import { HOUSE_PLOTS } from "@/modules/world/houses";

const purchaseInput = z.object({
  plot: z.number().int().refine((p) => (HOUSE_PLOTS as readonly number[]).includes(p), {
    message: "That plot doesn't exist. Nice try, surveyor.",
  }),
});

/**
 * POST /api/world/house/purchase — buy a neighborhood plot for coins.
 * One house per user and one owner per plot, both enforced by unique
 * constraints inside the same tx that debits the balance, so two buyers
 * racing for the last plot can't both win.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { plot } = await parseBody(req, purchaseInput);
  const price = await getHousePrice();

  const result = await withOutbox(
    async (tx) => {
      const mine = await tx.worldHouse.findUnique({ where: { userId: user.id } });
      if (mine) throw new HttpError(409, "You already own a house. This isn't a portfolio.");
      const taken = await tx.worldHouse.findUnique({ where: { plot } });
      if (taken) throw new HttpError(409, "Sold! Someone beat you to the closing table.");

      await spendCoins(
        tx,
        user.id,
        price,
        "world.house.purchased",
        `Bought the house at plot #${plot}`,
        `The house costs ${price} coins. The bank has declined your application.`,
        { plot }
      );
      await tx.worldHouse.create({ data: { userId: user.id, plot, tier: 1 } });
      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { coins: true },
      });
      return { coins: me.coins };
    },
    () => ({
      type: "world.house.purchased",
      payload: { userId: user.id, plot, price },
    })
  );

  return NextResponse.json({ ok: true, coins: result.coins, plot });
});
