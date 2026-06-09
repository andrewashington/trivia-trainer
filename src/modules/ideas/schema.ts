import { z } from "zod";

export const ideaInput = z.object({
  title: z.string().trim().min(1, "Say the idea!").max(200),
  detail: z.string().trim().max(2000).nullish(),
});

export const ideaPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  detail: z.string().trim().max(2000).nullish(),
  // Status moves are admin-only, enforced in the route.
  status: z.enum(["open", "planned", "done"]).optional(),
});

export const ideaVoteInput = z.object({
  voted: z.boolean(),
});

export const STATUS_META = {
  open: { label: "Open", badge: "bg-paper" },
  planned: { label: "Planned", badge: "bg-accent-blue text-white" },
  done: { label: "Done", badge: "bg-accent-green" },
} as const;
