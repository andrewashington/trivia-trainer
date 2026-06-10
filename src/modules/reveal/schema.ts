import { z } from "zod";
import type { IconName } from "@/components/icons";

export const promptInput = z
  .object({
    type: z.enum(["rank", "sealed"]),
    title: z.string().trim().min(1, "Give it a prompt").max(300),
    items: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
    deadline: z.coerce.date().optional(),
    unlockAt: z.coerce.date().optional(),
    sealedBody: z.string().trim().min(1).max(10_000).optional(),
    // sealed: optional early unseal once this many members vote for it
    unlockVotesNeeded: z.number().int().min(2).max(50).nullish(),
  })
  .superRefine((p, ctx) => {
    if (p.type === "rank" && (p.items?.length ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Rank needs at least 2 things to rank.",
      });
    }
    if (p.type === "sealed") {
      if (!p.sealedBody) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sealedBody"],
          message: "Write the note to seal.",
        });
      }
      if (!p.unlockAt || p.unlockAt <= new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unlockAt"],
          message: "Pick a future unlock date.",
        });
      }
    }
    if (p.deadline && p.deadline <= new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deadline"],
        message: "Deadline must be in the future.",
      });
    }
  });

export const submissionInput = z.object({
  // rank: the item indexes in the submitter's order, best first
  order: z.array(z.number().int().min(0)).max(12).optional(),
});

export const REVEAL_TYPE_META = {
  rank: { label: "Blind Rank", icon: "trophy", blurb: "Everyone ranks privately; the consensus drops at once." },
  sealed: { label: "Time Capsule", icon: "mail", blurb: "A note locked until a date — even you can't peek." },
} as const satisfies Record<string, { label: string; icon: IconName; blurb: string }>;
