import { z } from "zod";

/** Surfaces that accept a comment thread. Add a key + a validator to extend. */
export const COMMENT_TARGETS = ["poll", "idea", "event"] as const;
export type CommentTargetType = (typeof COMMENT_TARGETS)[number];

export const commentInput = z.object({
  targetType: z.enum(COMMENT_TARGETS),
  targetId: z.string().min(1),
  body: z.string().trim().min(1, "Say something.").max(2000),
});

export const commentQuery = z.object({
  targetType: z.enum(COMMENT_TARGETS),
  targetId: z.string().min(1),
});
