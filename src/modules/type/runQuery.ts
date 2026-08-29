import type { RunConfig, SessionKind, SessionMode } from "./engine";

export function configFromSearch(q: URLSearchParams): RunConfig {
  const keys = [...new Set(
    (q.get("keys") ?? "")
      .split("")
      .filter((c) => /[a-z]/i.test(c))
      .map((c) => c.toLowerCase())
  )];
  let kind = (q.get("kind") ?? "sandbox") as SessionKind;
  if (kind === "sandbox" && keys.length > 0) kind = "targeted";
  const placement = kind === "placement";
  return {
    kind,
    mode: (placement ? "time" : (q.get("mode") ?? "time")) as SessionMode,
    durationSec: placement ? 60 : Number(q.get("sec") ?? 60) || 60,
    wordCount: Number(q.get("n") ?? 25) || 25,
    punctuation: placement ? false : q.get("punct") === "1",
    numbers: placement ? false : q.get("numbers") === "1",
    targetKeys: placement ? [] : keys,
    quoteId: q.get("quote") ?? undefined,
    dailyDate: q.get("date") ?? undefined,
    workoutId: q.get("workout") ?? undefined,
    pieceId: q.get("piece") ?? undefined,
    seed: q.get("seed") ?? `${kind}:${Date.now()}`,
  };
}

export function searchFromConfig(config: RunConfig): string {
  const q = new URLSearchParams();
  q.set("kind", config.kind);
  q.set("mode", config.mode);
  if (config.durationSec) q.set("sec", String(config.durationSec));
  if (config.wordCount) q.set("n", String(config.wordCount));
  if (config.punctuation) q.set("punct", "1");
  if (config.numbers) q.set("numbers", "1");
  if (config.targetKeys.length) q.set("keys", config.targetKeys.join(""));
  if (config.quoteId) q.set("quote", config.quoteId);
  if (config.dailyDate) q.set("date", config.dailyDate);
  if (config.workoutId) q.set("workout", config.workoutId);
  if (config.pieceId) q.set("piece", config.pieceId);
  q.set("seed", config.seed);
  return `/type/run?${q.toString()}`;
}
