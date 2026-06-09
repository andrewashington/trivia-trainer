import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { forfeitInput } from "@/modules/stakes/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const [forfeits, spins] = await Promise.all([
    db.forfeit.findMany({
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, displayName: true } } },
    }),
    db.forfeitSpin.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        forfeit: { select: { text: true } },
        target: { select: { displayName: true } },
        spunBy: { select: { displayName: true } },
      },
    }),
  ]);
  return NextResponse.json({ forfeits, spins });
});

// Anyone can contribute to the pool — the group writes its own doom.
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { text } = await parseBody(req, forfeitInput);

  const forfeit = await withOutbox(
    (tx) => tx.forfeit.create({ data: { authorId: user.id, text } }),
    (f) => ({
      type: "forfeit.added",
      payload: { forfeitId: f.id, text: f.text, addedBy: user.id },
    })
  );
  return NextResponse.json({ forfeit }, { status: 201 });
});
