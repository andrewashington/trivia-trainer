import { z } from "zod";

export const CATEGORIES = ["person", "place", "thing"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ANSWERS = ["yes", "no", "sometimes"] as const;
export type Answer = (typeof ANSWERS)[number];

export const QUESTION_BUDGET = 20;

/** Host opens a round: a category and the secret nobody else sees. */
export const createGameSchema = z.object({
  category: z.enum(CATEGORIES),
  secret: z.string().trim().min(1, "Name your thing.").max(120, "Keep the secret short."),
});
export type CreateGameInput = z.infer<typeof createGameSchema>;

/** Anyone-but-the-host throws a yes/no question or a guess into the pool. */
export const askSchema = z.object({
  kind: z.enum(["question", "guess"]),
  text: z.string().trim().min(1, "Type something.").max(200, "Keep it under 200 characters."),
});
export type AskInput = z.infer<typeof askSchema>;

/**
 * Host's verdict on one entry. For a question, supply `answer`. For a
 * guess, supply `correct`. For reveal/give-up, supply neither + reveal:true.
 */
export const answerSchema = z
  .object({
    entryId: z.string().min(1).optional(),
    answer: z.enum(ANSWERS).optional(),
    correct: z.boolean().optional(),
    reveal: z.boolean().optional(),
  })
  .refine(
    (v) => v.reveal === true || (v.entryId && (v.answer !== undefined || v.correct !== undefined)),
    { message: "Nothing to do." }
  );
export type AnswerInput = z.infer<typeof answerSchema>;
