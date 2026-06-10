import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { commentInput, commentQuery, type CommentTargetType } from "@/modules/comments/schema";

/** No FK to the target, so insertion validates the target exists here. */
async function assertTargetExists(targetType: CommentTargetType, targetId: string) {
  const found =
    targetType === "poll"
      ? await db.poll.findUnique({ where: { id: targetId }, select: { id: true } })
      : targetType === "idea"
        ? await db.idea.findUnique({ where: { id: targetId }, select: { id: true } })
        : await db.event.findUnique({ where: { id: targetId }, select: { id: true } });
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
