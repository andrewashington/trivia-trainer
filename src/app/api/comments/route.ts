import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { commentInput, commentQuery, type CommentTargetType } from "@/modules/comments/schema";

/** No FK to the target, so insertion validates the target exists here. */
const TARGET_LOOKUPS: Record<CommentTargetType, (id: string) => Promise<unknown>> = {
  poll: (id) => db.poll.findUnique({ where: { id }, select: { id: true } }),
  idea: (id) => db.idea.findUnique({ where: { id }, select: { id: true } }),
  event: (id) => db.event.findUnique({ where: { id }, select: { id: true } }),
  recipe: (id) => db.recipe.findUnique({ where: { id }, select: { id: true } }),
  file: (id) => db.fileObject.findUnique({ where: { id }, select: { id: true } }),
  tierlist: (id) => db.tierList.findUnique({ where: { id }, select: { id: true } }),
  listing: (id) => db.listing.findUnique({ where: { id }, select: { id: true } }),
  challenge: (id) => db.challenge.findUnique({ where: { id }, select: { id: true } }),
  photo: (id) => db.photobookPhoto.findUnique({ where: { id }, select: { id: true } }),
  countdown: (id) => db.countdown.findUnique({ where: { id }, select: { id: true } }),
  nowplaying: (id) => db.nowPlayingItem.findUnique({ where: { id }, select: { id: true } }),
  claim: (id) => db.claim.findUnique({ where: { id }, select: { id: true } }),
  wish: (id) => db.wishlistItem.findUnique({ where: { id }, select: { id: true } }),
  smashdeck: (id) => db.smashDeck.findUnique({ where: { id }, select: { id: true } }),
};

async function assertTargetExists(targetType: CommentTargetType, targetId: string) {
  const found = await TARGET_LOOKUPS[targetType](targetId);
  if (!found) throw new HttpError(404, "That item no longer exists.");
}

export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const url = new URL(req.url);
  const { targetType, targetId } = commentQuery.parse({
    targetType: url.searchParams.get("targetType"),
    targetId: url.searchParams.get("targetId"),
  });
  const comments = await db.comment.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      authorId: c.author.id,
      authorName: c.author.displayName,
      authorAvatarUrl: c.author.avatarUrl,
    })),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, commentInput);
  await assertTargetExists(data.targetType, data.targetId);

  const comment = await withOutbox(
    (tx) =>
      tx.comment.create({
        data: {
          targetType: data.targetType,
          targetId: data.targetId,
          authorId: user.id,
          body: data.body,
        },
      }),
    (c) => ({
      type: "comment.created",
      payload: {
        commentId: c.id,
        targetType: c.targetType,
        targetId: c.targetId,
        authorId: user.id,
        authorName: user.displayName,
        body: c.body,
      },
    })
  );

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        authorId: user.id,
        authorName: user.displayName,
        authorAvatarUrl: user.avatarUrl,
      },
    },
    { status: 201 }
  );
});
