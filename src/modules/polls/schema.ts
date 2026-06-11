import { z } from "zod";
import type { IconName } from "@/components/icons";

export const pollInput = z
  .object({
    question: z.string().trim().min(1, "Ask the question!").max(300),
    type: z.enum(["single", "multi", "scale"]),
    anonymous: z.boolean(),
    sensitive: z.boolean().default(false),
    // Sealed results: hidden until this many members vote to reveal.
    revealThreshold: z.number().int().min(2).max(50).nullish(),
    // Scale polls have no options; choice polls need 2–8.
    options: z.array(z.string().trim().min(1).max(120)).max(8),
  })
  .superRefine((poll, ctx) => {
    if (poll.type !== "scale" && poll.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Give people at least 2 options.",
      });
    }
  });

export const pollVoteInput = z
  .object({
    optionIds: z.array(z.string()).max(8).optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .refine((v) => (v.optionIds?.length ?? 0) > 0 || v.rating !== undefined, {
    message: "Pick something first.",
  });

export const pollPatch = z.object({
  closed: z.boolean(),
});

export const POLL_TYPE_META = {
  single: { label: "Pick one", icon: "circle" },
  multi: { label: "Pick any", icon: "checkbox-on" },
  scale: { label: "Rate 1–5", icon: "fire" },
} as const satisfies Record<string, { label: string; icon: IconName }>;
