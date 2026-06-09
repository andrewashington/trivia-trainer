import { z } from "zod";

export const promptInput = z
  .object({
    type: z.enum(["rank", "sealed", "oracle"]),
    title: z.string().trim().min(1, "Give it a prompt").max(300),
    items: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
    scaleMax: z.number().int().min(2).max(10).optional(),
    deadline: z.coerce.date().optional(),
    unlockAt: z.coerce.date().optional(),
    sealedBody: z.string().trim().min(1).max(10_000).optional(),
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
  // oracle
  value: z.number().int().min(1).max(10).optional(),
});

export const REVEAL_TYPE_META = {
  rank: { label: "Blind Rank", icon: "🥇", blurb: "Everyone ranks privately; the consensus drops at once." },
  sealed: { label: "Sealed", icon: "✉️", blurb: "A note locked until a date — even you can't peek." },
  oracle: { label: "Oracle", icon: "🔮", blurb: "Answer on a scale; only the blend is ever shown." },
} as const;
