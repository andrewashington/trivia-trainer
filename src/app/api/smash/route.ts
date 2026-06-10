import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { deckInput } from "@/modules/smash/schema";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const decks = await db.smashDeck.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true } },
      cards: { select: { votes: { where: { userId: user.id }, select: { id: true } } } },
    },
  });
  return NextResponse.json({
    decks: decks.map(({ cards, ...deck }) => ({
      ...deck,
      cardCount: cards.length,
      myVoted: cards.filter((c) => c.votes.length > 0).length,
    })),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, deckInput);

  const deck = await withOutbox(
    async (tx) => {
      const deck = await tx.smashDeck.create({
        data: {
          creatorId: user.id,
          title: data.title,
          detail: data.detail ?? null,
        },
      });
      await tx.smashCard.createMany({
        data: data.cards.map((c, i) => ({
          deckId: deck.id,
          label: c.label,
          imageUrl: c.imageUrl ?? null,
          position: i,
        })),
      });
      return deck;
    },
    (d) => ({
      type: "smash.deck.created",
      payload: { deckId: d.id, title: d.title, creatorId: user.id, cardCount: data.cards.length },
    })
  );

  return NextResponse.json({ deck }, { status: 201 });
});
