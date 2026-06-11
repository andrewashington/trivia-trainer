import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { commentInput, commentQuery } from "@/modules/comments/schema";
import { resolveOwner, TARGET_LABEL, hrefForTarget } from "@/modules/comments/targets";

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

  const ownerId = await resolveOwner(data.targetType, data.targetId);
  if (ownerId === null) throw new HttpError(404, "That item no longer exists.");

  const comment = await withOutbox(
    async (tx) => {
      const c = await tx.comment.create({
        data: {
          targetType: data.targetType,
          targetId: data.targetId,
          authorId: user.id,
          body: data.body,
        },
      });
      if (ownerId !== user.id) {
        await tx.notification.create({
          data: {
            userId: ownerId,
            type: "comment",
            actorId: user.id,
            targetType: c.targetType,
            targetId: c.targetId,
            title: `${user.displayName} commented on your ${TARGET_LABEL[data.targetType]}`,
            body: c.body.slice(0, 160),
            href: hrefForTarget(data.targetType, data.targetId),
          },
        });
      }
      return c;
    },
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
