"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { confettiBurst, confettiCelebrate } from "@/lib/confetti";
import { Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import {
  QUESTIONS_PER_ROUND,
  type AnswerResult,
  type RoundPayload,
  type TriviaQuestion,
} from "@/modules/trivia/schema";

type Phase = "idle" | "loading" | "playing" | "done";

type Feedback = {
  picked: string;
  correct: boolean;
  correctAnswer: string;
};

type FinalResult = {
  score: number;
  isHighScore: boolean;
  isPersonalBest: boolean;
};

const DIFFICULTY_BG: Record<TriviaQuestion["difficulty"], string> = {
  easy: "bg-accent-green",
  medium: "bg-accent-yellow",
  hard: "bg-accent-red text-white",
};

export function TriviaGame() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string>("");
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [final, setFinal] = useState<FinalResult | null>(null);

  const start = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const round = await api<RoundPayload>("/api/trivia/round", {
        method: "POST",
      });
      setRoundId(round.roundId);
      setQuestions(round.questions);
      setIndex(0);
      setScore(0);
      setFeedback(null);
      setFinal(null);
      setPhase("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a round.");
      setPhase("idle");
    }
  }, []);

  const answer = useCallback(
    async (option: string) => {
      if (feedback || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await api<AnswerResult>("/api/trivia/answer", {
          method: "POST",
          body: { roundId, questionIndex: index, answer: option },
        });
        setFeedback({
          picked: option,
          correct: res.correct,
          correctAnswer: res.correctAnswer,
        });
        const newScore = score + (res.correct ? 1 : 0);
        if (res.correct) {
          setScore(newScore);
          confettiBurst();
        }
        if (res.done) {
          setFinal({
            score: res.score ?? newScore,
            isHighScore: res.isHighScore ?? false,
            isPersonalBest: res.isPersonalBest ?? false,
          });
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Answer didn't land. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [feedback, submitting, roundId, index, score, router]
  );

  const next = useCallback(() => {
    if (final) {
      setPhase("done");
      if (final.score === QUESTIONS_PER_ROUND) confettiCelebrate();
      return;
    }
    setFeedback(null);
    setIndex((i) => i + 1);
  }, [final]);

  // --- idle / loading ---
  if (phase === "idle" || phase === "loading") {
    return (
      <div className="brutal-card space-y-3 p-5 text-center">
        <PixelIcon name="zap" size={32} className="mx-auto" />
        <p className="font-display text-2xl font-bold">Quick round</p>
        <p className="font-mono text-xs uppercase text-ink/60">
          {QUESTIONS_PER_ROUND} questions · 4 choices · no take-backs
        </p>
        {error && (
          <p className="border-2 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}
        <Button onClick={start} variant="primary" disabled={phase === "loading"}>
          {phase === "loading" ? "Fetching questions…" : "Start round"}
        </Button>
      </div>
    );
  }

  // --- final screen ---
  if (phase === "done" && final) {
    const perfect = final.score === QUESTIONS_PER_ROUND;
    return (
      <div className="brutal-card animate-pop-in space-y-3 p-5 text-center">
        <p className="brutal-label">Round over</p>
        <p className="font-display text-4xl font-bold tabular-nums">
          {final.score}/{QUESTIONS_PER_ROUND}
        </p>
        {perfect && (
          <p className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-xs font-bold uppercase">
            <PixelIcon name="party-popper" size={14} /> Perfect round!
          </p>
        )}
        {final.isHighScore && (
          <p className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-xs font-bold uppercase">
            <PixelIcon name="crown" size={14} /> New group record!
          </p>
        )}
        {!final.isHighScore && final.isPersonalBest && (
          <p className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-lime px-2 py-1 font-mono text-xs font-bold uppercase">
            <PixelIcon name="star" size={14} /> Personal best
          </p>
        )}
        <div className="pt-1">
          <Button onClick={start} variant="green">
            Play again
          </Button>
        </div>
      </div>
    );
  }

  // --- playing ---
  const q = questions[index];
  if (!q) return null;

  return (
    <div className="space-y-3">
      {/* Progress strip */}
      <div className="flex items-stretch gap-2">
        <div className="brutal-card flex-1 px-3 py-2">
          <p className="brutal-label">Question</p>
          <p className="font-display text-2xl font-bold tabular-nums">
            {index + 1}/{QUESTIONS_PER_ROUND}
          </p>
        </div>
        <div className="brutal-card flex-1 px-3 py-2">
          <p className="brutal-label">Right so far</p>
          <p className="font-display text-2xl font-bold tabular-nums">{score}</p>
        </div>
      </div>

      {/* Question card */}
      <div className="brutal-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${DIFFICULTY_BG[q.difficulty]}`}
          >
            {q.difficulty}
          </span>
          <span className="font-mono text-[10px] uppercase text-ink/50">
            {q.category}
          </span>
        </div>
        <p className="font-display text-lg font-bold leading-snug">{q.question}</p>

        <div className="space-y-2">
          {q.options.map((option) => {
            const isPicked = feedback?.picked === option;
            const isCorrect = feedback?.correctAnswer === option;
            let look = "bg-paper hover:bg-accent-ocean/10";
            if (feedback) {
              if (isCorrect) look = "bg-accent-green";
              else if (isPicked) look = "bg-accent-red text-white";
              else look = "bg-paper opacity-50";
            }
            return (
              <button
                key={option}
                onClick={() => void answer(option)}
                disabled={!!feedback || submitting}
                className={`block w-full border-2 border-ink px-3 py-2.5 text-left font-mono text-sm font-bold shadow-brutal-sm transition-colors disabled:cursor-default ${look}`}
              >
                <span className="flex items-center gap-2">
                  {feedback && isCorrect && <PixelIcon name="check" size={14} />}
                  {feedback && isPicked && !isCorrect && (
                    <PixelIcon name="close" size={14} />
                  )}
                  {option}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="border-2 border-ink bg-accent-red/15 px-3 py-2 font-mono text-xs">
            {error}
          </p>
        )}

        {feedback && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="font-mono text-xs font-bold uppercase">
              {feedback.correct ? "Nailed it." : "Nope."}
            </p>
            <Button onClick={next} variant={feedback.correct ? "green" : "yellow"}>
              {final ? "See results" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
