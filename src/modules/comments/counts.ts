import { db } from "@/lib/db";
import type { CommentTargetType } from "@/modules/comments/schema";

/**
 * Server helper for list pages: comment counts for one target type,
 * keyed by targetId (missing key = 0).
 */
export async function commentCounts(
  targetType: CommentTargetType
): Promise<Map<string, number>> {
  const rows = await db.comment.groupBy({
    by: ["targetId"],
    where: { targetType },
    _count: true,
  });
  return new Map(rows.map((r) => [r.targetId, r._count]));
}
