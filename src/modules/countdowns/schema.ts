import { z } from "zod";

export const countdownInput = z.object({
  title: z.string().trim().min(1, "Give it a name").max(120),
  emoji: z.string().trim().max(8).nullish(),
  targetAt: z.coerce.date(),
  link: z.string().trim().url("That's not a link").max(500).nullish(),
});

/** How long a landed (past) countdown stays visible before hiding. */
export const LANDED_WINDOW_MS = 7 * 86_400_000;
