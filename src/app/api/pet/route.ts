import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { getPetView } from "@/modules/pet/engine";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  return NextResponse.json({ pet: await getPetView(user.id) });
});

const renameInput = z.object({
  name: z.string().trim().min(1, "It needs a name").max(40),
});

// Anyone can rename the pet — it's everyone's creature.
export const PATCH = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { name } = await parseBody(req, renameInput);
  await withOutbox(
    (tx) =>
      tx.petState.upsert({
        where: { id: 1 },
        create: { name },
        update: { name },
      }),
    () => ({ type: "pet.renamed", payload: { name, by: user.id } })
  );
  return NextResponse.json({ ok: true });
});
