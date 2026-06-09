import { z } from "zod";

export const claimInput = z
  .object({
    text: z.string().trim().min(1, "Call the shot!").max(500),
    resolvesAt: z.coerce.date(),
    counterpartyId: z.string().nullish(),
    stake: z.string().trim().max(300).nullish(),
    hidden: z.boolean(),
  })
  .superRefine((c, ctx) => {
    if (c.resolvesAt <= new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolvesAt"],
        message: "A claim about the past isn't a prediction.",
      });
    }
    // A hidden bet makes no sense: the counterparty has to know what
    // they're taking the other side of.
    if (c.hidden && c.counterpartyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hidden"],
        message: "Bets can't be hidden — your counterparty has to see it.",
      });
    }
    if (c.stake && !c.counterpartyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stake"],
        message: "A stake needs someone on the other side.",
      });
    }
  });

export const resolveInput = z.object({
  outcome: z.enum(["right", "wrong", "void"]),
});

export const forfeitInput = z.object({
  text: z.string().trim().min(1, "Write the dare").max(300),
});

export const spinInput = z.object({
  targetId: z.string().min(1),
  reason: z.string().trim().max(300).nullish(),
});
