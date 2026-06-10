import { z } from "zod";

/**
 * Trivia round contract. Questions come from Open Trivia DB via the
 * server proxy; correct answers never leave the server — the client
 * submits one answer at a time and gets graded.
 */

export const QUESTIONS_PER_ROUND = 10;

/** What the client sees: a question with shuffled options, no answer. */
export type TriviaQuestion = {
  category: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[]; // 4 options, shuffled server-side
};

export type RoundPayload = {
  roundId: string;
  questions: TriviaQuestion[];
};

export const answerInput = z.object({
  roundId: z.string().min(1).max(100),
  questionIndex: z
    .number()
    .int()
    .min(0)
    .max(QUESTIONS_PER_ROUND - 1),
  answer: z.string().min(1).max(500),
});

export type AnswerInput = z.infer<typeof answerInput>;

/** Grade response: correctness now, round results once it's done. */
export type AnswerResult = {
  correct: boolean;
  correctAnswer: string;
  done: boolean;
  score?: number; // present when done
  isHighScore?: boolean;
  isPersonalBest?: boolean;
};
