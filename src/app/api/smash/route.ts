import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { maxFileSizeBytes, presignUpload } from "@/lib/storage";
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

  // Attached uploads ride the photobook flow: store a key per card, hand
  // back presigned PUT URLs, and the client pushes bytes straight to the
  // bucket. Uploaded images win over pasted links.
  const cap = maxFileSizeBytes();
  for (const c of data.cards) {
    if (c.image && c.image.sizeBytes > cap) {
      throw new HttpError(
        413,
        `“${c.label}” image too big — the cap is ${Math.floor(cap / 1024 / 1024)} MB.`
      );
    }
  }
  const cards = data.cards.map((c, i) => ({
    label: c.label,
    imageUrl: c.image ? null : (c.imageUrl ?? null),
    storageKey: c.image
      ? `smash/${randomUUID()}-${c.image.filename.replace(/[^\w.\-]+/g, "_")}`
      : null,
    mimeType: c.image?.mimeType ?? null,
    position: i,
  }));

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
        data: cards.map((c) => ({
          deckId: deck.id,
          label: c.label,
          imageUrl: c.imageUrl,
          storageKey: c.storageKey,
          position: c.position,
        })),
      });
      return deck;
    },
    (d) => ({
      type: "smash.deck.created",
      payload: { deckId: d.id, title: d.title, creatorId: user.id, cardCount: data.cards.length },
    })
  );

  const uploads = await Promise.all(
    cards
      .filter((c) => c.storageKey && c.mimeType)
      .map(async (c) => ({
        position: c.position,
        uploadUrl: await presignUpload(c.storageKey!, c.mimeType!),
      }))
  );

  return NextResponse.json({ deck, uploads }, { status: 201 });
});
