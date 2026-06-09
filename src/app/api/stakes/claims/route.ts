import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { claimInput } from "@/modules/stakes/schema";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const claims = await db.claim.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true } },
      counterparty: { select: { id: true, displayName: true } },
    },
  });
  // Concealment: hidden + unresolved claims mask their text for
  // everyone but the author.
  return NextResponse.json({
    claims: claims.map((c) => ({
      ...c,
      text:
        c.hidden && c.outcome === null && c.creatorId !== user.id
          ? null
          : c.text,
    })),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, claimInput);

  if (data.counterpartyId) {
    if (data.counterpartyId === user.id) {
      throw new HttpError(400, "You can't bet against yourself.");
    }
    const other = await db.user.findUnique({ where: { id: data.counterpartyId } });
    if (!other) throw new HttpError(404, "Counterparty not found.");
  }

  // Created = locked. There is no edit route, on purpose.
  const claim = await withOutbox(
    (tx) =>
      tx.claim.create({
        data: {
          creatorId: user.id,
          text: data.text,
          resolvesAt: data.resolvesAt,
          hidden: data.hidden,
          counterpartyId: data.counterpartyId ?? null,
          stake: data.stake ?? null,
        },
      }),
    (c) => ({
      type: "claim.created",
      payload: {
        claimId: c.id,
        // Hidden predictions stay hidden in the outbox too.
        text: c.hidden ? null : c.text,
        hidden: c.hidden,
        resolvesAt: c.resolvesAt.toISOString(),
        creatorId: user.id,
        counterpartyId: c.counterpartyId,
        stake: c.stake,
      },
    })
  );

  return NextResponse.json({ claim: { id: claim.id } }, { status: 201 });
});
