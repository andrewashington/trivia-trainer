import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";

type Ctx = { params: { id: string } };

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  const deck = await db.smashDeck.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      cards: {
        orderBy: { position: "asc" },
        include: {
          votes: {
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
        },
      },
    },
  });
  if (!deck) throw new HttpError(404, "Deck not found.");

  return NextResponse.json({
    deck: {
      id: deck.id,
      title: deck.title,
      detail: deck.detail,
      createdAt: deck.createdAt,
      creator: deck.creator,
      cards: deck.cards.map((c) => ({
        id: c.id,
        label: c.label,
        imageUrl: c.imageUrl,
        position: c.position,
        votes: c.votes.map((v) => ({
          userId: v.user.id,
          userName: v.user.displayName,
          avatarUrl: v.user.avatarUrl,
          verdict: v.verdict,
        })),
      })),
    },
  });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await db.smashDeck.findUnique({
    where: { id: params.id },
    include: { cards: { select: { storageKey: true } } },
  });
  if (!existing) throw new HttpError(404, "Deck not found.");
  assertCanModify(user, existing.creatorId);

  await withOutbox(
    (tx) => tx.smashDeck.delete({ where: { id: existing.id } }),
    () => ({
      type: "smash.deck.deleted",
      payload: { deckId: existing.id, title: existing.title, deletedBy: user.id },
    })
  );

  // Best-effort bucket cleanup of uploaded card images — an orphaned
  // object must not fail the delete.
  await Promise.all(
    existing.cards
      .filter((c) => c.storageKey)
      .map((c) => deleteObject(c.storageKey!).catch(() => {}))
  );

  return NextResponse.json({ ok: true });
});
