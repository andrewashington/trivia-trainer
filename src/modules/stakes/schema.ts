import { z } from "zod";

export const claimInput = z
  .object({
    text: z.string().trim().min(1, "Call the shot!").max(500),
    resolvesAt: z.coerce.date(),
    counterpartyId: z.string().nullish(),
    stake: z.string().trim().max(300).nullish(),
    hidden: z.boolean(),
    // Sports mode: both or neither.
    fixtureId: z.string().nullish(),
    pickTeam: z.string().trim().max(120).nullish(),
  })
  .superRefine((c, ctx) => {
    if (!!c.fixtureId !== !!c.pickTeam) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pickTeam"],
        message: "A sports claim needs both the game and your pick.",
      });
    }
    // The game card itself would leak a "hidden" sports claim.
    if (c.hidden && c.fixtureId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hidden"],
        message: "Sports claims can't be hidden — the matchup is public.",
      });
    }
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
