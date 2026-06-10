import { randomUUID } from "crypto";
import { HttpError } from "@/lib/session";
import {
  QUESTIONS_PER_ROUND,
  type TriviaQuestion,
} from "@/modules/trivia/schema";

/**
 * Server-side trivia engine: proxies Open Trivia DB (no key needed),
 * keeps an opentdb session token in module memory so questions don't
 * repeat, and holds active rounds in an in-memory Map so correct
 * answers never reach the client. Rounds are ephemeral (TTL 30 min) —
 * no DB model; only the final score is persisted (ArcadeScore).
 */

const ROUND_TTL_MS = 30 * 60_000;
const OPENTDB_TIMEOUT_MS = 8000;

type StoredQuestion = TriviaQuestion & { correct: string };

export type Round = {
  id: string;
  userId: string;
  questions: StoredQuestion[];
  /** Per-question grade; null = not answered yet. */
  answers: (boolean | null)[];
  finalized: boolean;
  createdAt: number;
};

const rounds = new Map<string, Round>();

function sweepRounds(): void {
  const now = Date.now();
  for (const [id, r] of rounds) {
    if (now - r.createdAt > ROUND_TTL_MS) rounds.delete(id);
  }
}

// --- opentdb session token (avoids repeat questions per server) ---

let sessionToken: string | null = null;

async function opentdbJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(OPENTDB_TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new HttpError(502, "Trivia source is unavailable.");
  return (await res.json()) as Record<string, unknown>;
}

async function requestToken(): Promise<string> {
  const data = await opentdbJson(
    "https://opentdb.com/api_token.php?command=request"
  );
  const token = data.token;
  if (typeof token !== "string" || !token) {
    throw new HttpError(502, "Trivia source is unavailable.");
  }
  sessionToken = token;
  return token;
}

type RawQuestion = {
  category: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** url3986 encoding -> plain text. Covers HTML entities entirely. */
function dec(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function fetchQuestions(): Promise<StoredQuestion[]> {
  const token = sessionToken ?? (await requestToken());
  const url =
    `https://opentdb.com/api.php?amount=${QUESTIONS_PER_ROUND}` +
    `&type=multiple&encode=url3986&token=${encodeURIComponent(token)}`;

  let data = await opentdbJson(url);
  let code = Number(data.response_code);

  // 3 = token not found, 4 = token exhausted — get a fresh one, retry once.
  if (code === 3 || code === 4) {
    await requestToken();
    data = await opentdbJson(
      `https://opentdb.com/api.php?amount=${QUESTIONS_PER_ROUND}` +
        `&type=multiple&encode=url3986&token=${encodeURIComponent(sessionToken!)}`
    );
    code = Number(data.response_code);
  }
  if (code !== 0 || !Array.isArray(data.results)) {
    throw new HttpError(502, "Couldn't fetch trivia questions. Try again.");
  }

  return (data.results as RawQuestion[]).map((q) => {
    const correct = dec(q.correct_answer);
    const difficulty = dec(q.difficulty);
    return {
      category: dec(q.category),
      difficulty: (["easy", "medium", "hard"].includes(difficulty)
        ? difficulty
        : "medium") as TriviaQuestion["difficulty"],
      question: dec(q.question),
      options: shuffle([correct, ...q.incorrect_answers.map(dec)]),
      correct,
    };
  });
}

/** Start a round for a user; returns it with answers held server-side. */
export async function createRound(userId: string): Promise<Round> {
  sweepRounds();
  const questions = await fetchQuestions();
  const round: Round = {
    id: randomUUID(),
    userId,
    questions,
    answers: questions.map(() => null),
    finalized: false,
    createdAt: Date.now(),
  };
  rounds.set(round.id, round);
  return round;
}

/** Strip correct answers for the client payload. */
export function publicQuestions(round: Round): TriviaQuestion[] {
  return round.questions.map(({ correct: _correct, ...q }) => q);
}

export function getRound(id: string, userId: string): Round {
  sweepRounds();
  const round = rounds.get(id);
  if (!round || round.userId !== userId) {
    throw new HttpError(404, "Round not found (it may have expired).");
  }
  return round;
}

/** Grade one answer. Throws if already answered. */
export function gradeAnswer(
  round: Round,
  questionIndex: number,
  answer: string
): { correct: boolean; correctAnswer: string; done: boolean; score: number } {
  const q = round.questions[questionIndex];
  if (!q) throw new HttpError(400, "No such question in this round.");
  if (round.answers[questionIndex] !== null) {
    throw new HttpError(409, "That question was already answered.");
  }
  const correct = answer === q.correct;
  round.answers[questionIndex] = correct;
  const done = round.answers.every((a) => a !== null);
  const score = round.answers.filter(Boolean).length;
  return { correct, correctAnswer: q.correct, done, score };
}
