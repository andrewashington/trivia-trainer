import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { SmashGame, type DeckView } from "@/modules/smash/SmashGame";

export const dynamic = "force-dynamic";

export default async function SmashDeckPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/signin");

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
  if (!deck) notFound();

  const commentCount = await db.comment.count({
    where: { targetType: "smashdeck", targetId: deck.id },
  });

  // Uploaded card images live in the private bucket — presign view URLs
  // (signing is local/cheap; the page is force-dynamic so they stay fresh).
  const signed = new Map<string, string>(
    await Promise.all(
      deck.cards
        .filter((c) => c.storageKey)
        .map(async (c): Promise<[string, string]> => {
          try {
            return [c.id, await presignView(c.storageKey!)];
          } catch {
            return [c.id, ""];
          }
        })
    )
  );

  const view: DeckView = {
    id: deck.id,
    title: deck.title,
    detail: deck.detail,
    creatorId: deck.creator.id,
    creatorName: deck.creator.displayName,
    creatorAvatarUrl: deck.creator.avatarUrl,
    cards: deck.cards.map((c) => ({
      id: c.id,
      label: c.label,
      imageUrl: signed.get(c.id) || c.imageUrl,
      votes: c.votes.map((v) => ({
        userId: v.user.id,
        userName: v.user.displayName,
        avatarUrl: v.user.avatarUrl,
        verdict: v.verdict as "smash" | "pass",
      })),
    })),
  };

  return (
    <SmashGame
      deck={view}
      viewerId={user.id}
      viewerName={user.displayName}
      viewerAvatarUrl={user.avatarUrl}
      viewerIsAdmin={user.role === "admin"}
      canDelete={user.id === deck.creatorId || user.role === "admin"}
      commentCount={commentCount}
    />
  );
}
