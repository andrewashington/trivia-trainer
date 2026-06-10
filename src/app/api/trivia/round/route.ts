import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createRound, publicQuestions } from "@/modules/trivia/store";
import type { RoundPayload } from "@/modules/trivia/schema";

/**
 * Start a trivia round: pulls 10 questions from Open Trivia DB (proxied
 * so the session token stays server-side) and returns them WITHOUT the
 * correct answers — grading happens per-question in /api/trivia/answer.
 */
export const POST = apiHandler(async () => {
  const user = await requireUser();
  const round = await createRound(user.id);
  const payload: RoundPayload = {
    roundId: round.id,
    questions: publicQuestions(round),
  };
  return NextResponse.json(payload, { status: 201 });
});
