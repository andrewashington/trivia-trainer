import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { spendCoins } from "@/modules/arcade/bank";
import { getPetView } from "@/modules/pet/engine";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json({ pet: await getPetView(user.id) });
});

const renameInput = z.object({
  name: z.string().trim().min(1, "It needs a name").max(40),
});

const RENAME_COST = 500; // not exported: route files may only export HTTP handlers

// Anyone can rename the pet — it's everyone's creature — but vanity
// costs: a rename runs 500 coins (no-op same-name saves are free).
export const PATCH = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { name } = await parseBody(req, renameInput);
  await withOutbox(
    async (tx) => {
      const current = await tx.petState.findUnique({ where: { id: 1 } });
      if (current && current.name === name) return current;
      if (current) {
        await spendCoins(
          tx,
          user.id,
          RENAME_COST,
          "pet.renamed",
          `Renamed the pet to ${name}`,
          `Renaming the pet costs ${RENAME_COST} coins.`
        );
      }
      return tx.petState.upsert({
        where: { id: 1 },
        create: { name },
        update: { name },
      });
    },
    () => ({ type: "pet.renamed", payload: { name, by: user.id } })
  );
  return NextResponse.json({ ok: true });
});
