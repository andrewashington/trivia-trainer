"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui";
import { scoreRun, type RunConfig, type Stroke } from "./engine";

type Phase = "idle" | "running" | "done";

type SubmitOk = {
  score: { wpm: number; rawWpm: number; accuracy: number };
  newBadges: string[];
};

function newId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildLog(words: string[], typedWords: string[], times: number[][]): Stroke[] {
  const log: Stroke[] = [];
  for (let i = 0; i < typedWords.length; i++) {
    const expect = words[i] ?? "";
    const got = typedWords[i] ?? "";
    const ts = times[i] ?? [];
    const n = Math.max(expect.length, got.length);
    for (let c = 0; c < n; c++) {
      const e = expect[c] ?? "";
      const g = got[c] ?? "";
      if (!e && !g) continue;
      log.push({ t: ts[c] ?? (log.at(-1)?.t ?? 0), expect: e, got: g || (e ? "" : "") });
    }
    if (i < typedWords.length - 1 || (i < words.length - 1 && typedWords.length > i + 0 && i < typedWords.length - 1)) {
      // space after a committed word
    }
    if (i < typedWords.length - 1) {
      log.push({ t: ts[expect.length] ?? (log.at(-1)?.t ?? 0) + 1, expect: " ", got: " " });
    }
  }
  return log;
}

export function Typer({
  config,
  words,
  backHref = "/type",
  nextHref,
  nextLabel = "Next",
}: {
  config: RunConfig;
  words: string[];
  backHref?: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [focused, setFocused] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [typedWords, setTypedWords] = useState<string[]>([]);
  const [times, setTimes] = useState<number[][]>([]);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<SubmitOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(newId);

  const durationMs = (config.durationSec ?? 60) * 1000;
  const elapsed = startedAt.current ? now - startedAt.current : 0;
  const remaining = config.mode === "time" ? Math.max(0, durationMs - elapsed) : 0;

  const live = useMemo(() => {
    const committed = [...typedWords];
    if (typed.length > 0 || phase === "running") committed.push(typed);
    const log = buildLog(words, committed, times);
    const ms = Math.max(elapsed, 1);
    return scoreRun(words.join(" "), log, ms);
  }, [typedWords, typed, times, words, elapsed, phase]);

  const finish = useCallback(
    async (finalTyped: string, finalWords: string[], finalTimes: number[][]) => {
      if (phase === "done") return;
      setPhase("done");
      const committed = finalTyped.length > 0 || finalWords.length === 0 ? [...finalWords, finalTyped] : finalWords;
      const log = buildLog(words, committed, finalTimes);
      const ms =
        config.mode === "time"
          ? durationMs
          : Math.max(1, (startedAt.current ? Date.now() - startedAt.current : 1000));
      const preview = scoreRun(words.join(" "), log, ms);
      setResult({ score: preview, newBadges: [] });
      try {
        const res = await fetch("/api/type/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: runId,
            config,
            prompt: words.join(" "),
            log,
            durationMs: ms,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Submit failed");
        if (json.score) setResult({ score: json.score, newBadges: json.newBadges ?? [] });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
      }
    },
    [phase, words, config, durationMs, runId]
  );

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "running" && config.mode === "time" && remaining <= 0) {
      void finish(typed, typedWords, times);
    }
  }, [phase, config.mode, remaining, finish, typed, typedWords, times]);

  const reset = useCallback(() => {
    startedAt.current = null;
    setPhase("idle");
    setWordIndex(0);
    setTyped("");
    setTypedWords([]);
    setTimes([]);
    setNow(0);
    setResult(null);
    setError(null);
    setRunId(newId());
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" && (phase === "running" || phase === "idle") && focused) {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, focused, reset]);

  function startIfNeeded() {
    if (startedAt.current == null) {
      startedAt.current = Date.now();
      setNow(Date.now());
      setPhase("running");
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (phase === "done") return;
    const value = e.target.value;
    startIfNeeded();
    const t = Date.now() - (startedAt.current ?? Date.now());

    if (value.endsWith(" ") || value.includes(" ")) {
      const pieces = value.split(" ");
      const last = pieces.pop() ?? "";
      const committed = pieces.filter((p, i) => i === 0 || p.length > 0 || pieces[i - 1] !== "");
      // First token before spaces is the current word commit
      const word = (committed[0] ?? typed).replace(/ /g, "");
      const nextWords = [...typedWords, word];
      const nextTimes = [...times];
      const cur = [...(nextTimes[wordIndex] ?? [])];
      while (cur.length < word.length) cur.push(t);
      nextTimes[wordIndex] = cur;
      if (config.mode === "words" && nextWords.length >= (config.wordCount ?? words.length)) {
        setTypedWords(nextWords);
        setTimes(nextTimes);
        setTyped("");
        void finish("", nextWords, nextTimes);
        return;
      }
      if (config.mode === "quote" && nextWords.length >= words.length) {
        setTypedWords(nextWords);
        setTimes(nextTimes);
        setTyped("");
        void finish("", nextWords, nextTimes);
        return;
      }
      setTypedWords(nextWords);
      setTimes(nextTimes);
      setWordIndex((i) => i + 1);
      setTyped(last);
      return;
    }

    setTyped(value);
    setTimes((prev) => {
      const next = [...prev];
      const cur = [...(next[wordIndex] ?? [])];
      if (value.length > typed.length) cur[value.length - 1] = t;
      else cur.length = value.length;
      next[wordIndex] = cur;
      return next;
    });
  }

  const visible = words.slice(0, wordIndex + 40);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={typed}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={phase === "done"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-label="Type here"
      />

      <div className="mb-4 flex items-center justify-between font-mono text-sm tabular-nums text-ink/50">
        <span>
          {config.mode === "time"
            ? `${Math.ceil(remaining / 1000)}s`
            : `${Math.min(wordIndex, words.length)} / ${config.wordCount ?? words.length}`}
        </span>
        <span>
          {phase === "idle" ? "—" : `${live.wpm.toFixed(0)} wpm`}
          {phase !== "idle" && (
            <span className="ml-3">{Math.round(live.accuracy * 100)}%</span>
          )}
        </span>
        {isRatedChip(config) && <span className="text-accent-typewriter">counts for PB</span>}
      </div>

      <div
        className="relative min-h-[8.5rem] cursor-text border-3 border-ink bg-paper px-4 py-6 shadow-brutal"
        onClick={() => inputRef.current?.focus()}
      >
        {!focused && phase !== "done" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/90 font-display text-lg font-bold uppercase tracking-wide">
            click to type
          </div>
        )}
        <p className="font-mono text-xl leading-relaxed tracking-wide">
          {visible.map((word, i) => {
            const idx = i;
            const done = typedWords[idx];
            const current = idx === wordIndex;
            return (
              <span key={`${word}-${idx}`} className="mr-[0.55em] inline-block">
                {word.split("").map((ch, c) => {
                  const got = current ? typed[c] : done?.[c];
                  const cls =
                    got == null
                      ? current && c === typed.length
                        ? "border-b-2 border-accent-typewriter text-ink"
                        : "text-ink/35"
                      : got === ch
                        ? "text-ink"
                        : "text-accent-red";
                  return (
                    <span key={c} className={cls}>
                      {ch}
                    </span>
                  );
                })}
                {current && typed.length > word.length && (
                  <span className="text-accent-red">{typed.slice(word.length)}</span>
                )}
                {!current && done && done.length > word.length && (
                  <span className="text-accent-red">{done.slice(word.length)}</span>
                )}
              </span>
            );
          })}
        </p>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-ink/35">Tab restarts</p>

      {phase === "done" && result && (
        <div className="mt-6 space-y-4 border-3 border-ink bg-card p-4 shadow-brutal">
          <p className="font-display text-3xl font-bold tabular-nums">
            {result.score.wpm.toFixed(1)} <span className="text-base text-ink/50">WPM</span>
          </p>
          <p className="font-mono text-sm text-ink/60">
            {Math.round(result.score.accuracy * 100)}% accuracy
            {result.score.rawWpm != null && ` · ${result.score.rawWpm.toFixed(1)} raw`}
          </p>
          {result.newBadges.length > 0 && (
            <p className="text-sm">New badge{result.newBadges.length === 1 ? "" : "s"}: {result.newBadges.join(", ")}</p>
          )}
          {error && <p className="text-sm text-accent-red">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reset}>
              Again
            </Button>
            {nextHref ? (
              <LinkButton href={nextHref}>{nextLabel}</LinkButton>
            ) : (
              <LinkButton href={backHref} variant="ghost">
                Back
              </LinkButton>
            )}
            {!nextHref && (
              <Button type="button" variant="ghost" onClick={() => router.push(backHref)}>
                Hub
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function isRatedChip(config: RunConfig) {
  return (
    (config.kind === "placement" || config.kind === "sandbox") &&
    config.mode === "time" &&
    config.durationSec === 60 &&
    !config.punctuation &&
    !config.numbers &&
    config.targetKeys.length === 0
  );
}
