"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LinkButton } from "@/components/ui";
import { Typer } from "./Typer";
import { QUOTES } from "./quotes";
import { WORD_LIST } from "./words";
import { wordsForConfig, type RunConfig, type WorkoutPiece } from "./engine";
import { configFromSearch, searchFromConfig } from "./runQuery";

export function RunClient() {
  const params = useSearchParams();
  const config = useMemo(() => configFromSearch(params), [params]);
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextHref, setNextHref] = useState<string | undefined>();

  useEffect(() => {
    void (async () => {
      try {
        if (config.kind === "daily") {
          const res = await fetch(`/api/type/daily?date=${config.dailyDate ?? ""}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Daily failed");
          setWords(json.words);
          return;
        }
        if (config.kind === "workout") {
          const res = await fetch("/api/type/workout");
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Workout failed");
          const pieces = json.pieces as WorkoutPiece[];
          const piece = pieces.find((p) => p.id === config.pieceId) ?? pieces.find((p) => !("sessionId" in p));
          if (!piece) throw new Error("No piece left.");
          const w = wordsForConfig(piece.config, WORD_LIST, QUOTES);
          setWords(w);
          const idx = pieces.findIndex((p) => p.id === piece.id);
          const nxt = pieces[idx + 1];
          setNextHref(nxt ? searchFromConfig(nxt.config) : "/type");
          return;
        }
        if (config.mode === "quote" && !config.quoteId) {
          const pack = QUOTES.filter((q) => q.length === (params.get("len") === "medium" ? "medium" : "short"));
          const q = pack[Math.floor(Math.random() * pack.length)] ?? QUOTES[0];
          setWords(q.text.split(/\s+/));
          return;
        }
        setWords(wordsForConfig(config, WORD_LIST, QUOTES));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [config, params]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-accent-red">{error}</p>
        <LinkButton href="/type" variant="ghost">
          Back
        </LinkButton>
      </div>
    );
  }
  if (!words) return <p className="font-mono text-sm text-ink/50">Loading…</p>;

  return (
    <Typer
      config={hydrateDaily(config)}
      words={words}
      nextHref={nextHref}
      nextLabel={nextHref === "/type" ? "Hub" : "Next piece"}
    />
  );
}

function hydrateDaily(config: RunConfig): RunConfig {
  if (config.kind !== "daily") return config;
  return { ...config, mode: "time", durationSec: 60, dailyDate: config.dailyDate };
}
