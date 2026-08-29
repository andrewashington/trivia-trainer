export type SessionKind = "placement" | "workout" | "daily" | "sandbox" | "targeted";
export type SessionMode = "time" | "words" | "quote";

export type RunConfig = {
  kind: SessionKind;
  mode: SessionMode;
  durationSec?: number;
  wordCount?: number;
  punctuation: boolean;
  numbers: boolean;
  targetKeys: string[];
  quoteId?: string;
  dailyDate?: string;
  workoutId?: string;
  pieceId?: string;
  seed: string;
};

export type Stroke = { t: number; expect: string; got: string };

export type Score = {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctChars: number;
  incorrectChars: number;
  durationMs: number;
};

export type KeyRow = {
  grapheme: string;
  hits: number;
  misses: number;
  latencyEmaMs: number;
  wasWeakAt?: string | Date | null;
};

export type Quote = { id: string; text: string; length: "short" | "medium" };

export type WorkoutPiece = {
  id: string;
  kind: "warmup" | "weak" | "mixed" | "quote";
  config: RunConfig;
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const PUNCT = [",", ".", "?", "!", "'"];
const EMA_ALPHA = 0.2;
const LEARNING_MIN = 8;
const WEAK_SAMPLES = 20;
const WEAK_SCORE = 0.25;
const CLEARED_SAMPLES = 30;
const CLEARED_SCORE = 0.15;

export function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}

export function isRated(
  config: Pick<RunConfig, "kind" | "mode" | "durationSec" | "punctuation" | "numbers" | "targetKeys">
): boolean {
  if (config.mode !== "time" || config.durationSec !== 60) return false;
  if (config.punctuation || config.numbers) return false;
  if (config.targetKeys.length > 0) return false;
  return config.kind === "placement" || config.kind === "sandbox";
}

export function scoreRun(prompt: string, log: Stroke[], durationMs: number): Score {
  let correctChars = 0;
  let incorrectChars = 0;
  for (const s of log) {
    if (s.expect !== "" && s.got === s.expect) correctChars += 1;
    else incorrectChars += 1;
  }
  const minutes = Math.max(durationMs, 1) / 60_000;
  const wpm = correctChars / 5 / minutes;
  const rawWpm = log.length / 5 / minutes;
  const denom = correctChars + incorrectChars;
  const accuracy = denom === 0 ? 0 : correctChars / denom;
  return { wpm, rawWpm, accuracy, correctChars, incorrectChars, durationMs };
}

export function weakness(
  hits: number,
  misses: number,
  latencyEmaMs: number,
  medianMs: number
): number | null {
  const samples = hits + misses;
  if (samples < LEARNING_MIN) return null;
  const errorRate = misses / samples;
  const slowFactor = medianMs > 0 ? latencyEmaMs / medianMs : 1;
  return errorRate * 0.65 + Math.max(0, slowFactor - 1) * 0.35;
}

export function userMedianLatency(stats: KeyRow[]): number {
  const lat = stats
    .filter((s) => LETTERS.includes(s.grapheme) && s.hits + s.misses >= LEARNING_MIN)
    .map((s) => s.latencyEmaMs)
    .sort((a, b) => a - b);
  if (lat.length === 0) return 200;
  const mid = Math.floor(lat.length / 2);
  return lat.length % 2 === 0 ? (lat[mid - 1] + lat[mid]) / 2 : lat[mid];
}

export function pickTargets(stats: KeyRow[]): string[] {
  const median = userMedianLatency(stats);
  const byKey = new Map(stats.map((s) => [s.grapheme, s]));
  const scored = LETTERS.map((g) => {
    const row = byKey.get(g);
    const w = row ? weakness(row.hits, row.misses, row.latencyEmaMs, median) : null;
    const samples = row ? row.hits + row.misses : 0;
    return { g, w, samples };
  });
  const weak = scored
    .filter((s) => s.w != null)
    .sort((a, b) => (b.w ?? 0) - (a.w ?? 0));
  const targets: string[] = [];
  for (const s of weak) {
    if (targets.length >= 3) break;
    targets.push(s.g);
  }
  if (targets.length < 3) {
    const fill = [...scored].sort((a, b) => a.samples - b.samples);
    for (const s of fill) {
      if (targets.length >= 3) break;
      if (!targets.includes(s.g)) targets.push(s.g);
    }
  }
  return targets;
}

export function isWeakNow(row: KeyRow, medianMs: number): boolean {
  const samples = row.hits + row.misses;
  const w = weakness(row.hits, row.misses, row.latencyEmaMs, medianMs);
  return w != null && samples >= WEAK_SAMPLES && w >= WEAK_SCORE;
}

export function isCleared(row: KeyRow, medianMs: number): boolean {
  if (!row.wasWeakAt) return false;
  const samples = row.hits + row.misses;
  const w = weakness(row.hits, row.misses, row.latencyEmaMs, medianMs);
  return w != null && samples >= CLEARED_SAMPLES && w < CLEARED_SCORE;
}

export function applyStrokeDeltas(
  stats: Map<string, KeyRow>,
  log: Stroke[]
): Map<string, KeyRow> {
  const next = new Map(stats);
  const touch = (g: string): KeyRow => {
    const cur = next.get(g) ?? { grapheme: g, hits: 0, misses: 0, latencyEmaMs: 200, wasWeakAt: null };
    const copy = { ...cur };
    next.set(g, copy);
    return copy;
  };

  for (let i = 0; i < log.length; i++) {
    const s = log[i];
    if (s.expect === " ") continue;
    const prevT = i > 0 ? log[i - 1].t : 0;
    const dt = Math.max(0, s.t - prevT);

    if (s.expect === "") {
      if (s.got && s.got !== " ") {
        const row = touch(s.got.toLowerCase());
        row.misses += 1;
      }
      continue;
    }

    const g = s.expect.toLowerCase();
    if (g.length !== 1) continue;
    const row = touch(g);
    if (s.got === s.expect) {
      row.hits += 1;
      row.latencyEmaMs = row.hits === 1 ? dt : row.latencyEmaMs * (1 - EMA_ALPHA) + dt * EMA_ALPHA;
    } else {
      row.misses += 1;
    }
  }
  return next;
}

export function markWasWeak(stats: Iterable<KeyRow>): void {
  const rows = [...stats];
  const median = userMedianLatency(rows);
  for (const row of rows) {
    if (!LETTERS.includes(row.grapheme)) continue;
    if (!row.wasWeakAt && isWeakNow(row, median)) {
      row.wasWeakAt = new Date();
    }
  }
}

/** Hash a string to a 32-bit seed, then mulberry32. */
export function rng(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)]!;
}

function decorate(word: string, rand: () => number, punct: boolean, numbers: boolean): string {
  let out = word;
  if (numbers && rand() < 0.18) out = `${out}${Math.floor(rand() * 10)}`;
  if (punct && rand() < 0.22) out = `${out}${pick(PUNCT, rand)}`;
  return out;
}

export function generateWords(opts: {
  list: string[];
  seed: string;
  n: number;
  targets?: string[];
  targetRatio?: number;
  punct?: boolean;
  numbers?: boolean;
}): string[] {
  const rand = rng(opts.seed);
  const list = opts.list.filter((w) => w.length > 1);
  if (list.length === 0) return [];
  const targets = (opts.targets ?? []).map((t) => t.toLowerCase()).filter((t) => LETTERS.includes(t));
  const ratio = targets.length > 0 ? (opts.targetRatio ?? 0.6) : 0;
  const targeted = targets.length
    ? list.filter((w) => targets.some((t) => w.includes(t)))
    : [];
  const pool = targeted.length > 0 ? targeted : list;
  const out: string[] = [];
  for (let i = 0; i < opts.n; i++) {
    const useTarget = targets.length > 0 && rand() < ratio && pool.length > 0;
    const word = pick(useTarget ? pool : list, rand);
    out.push(decorate(word, rand, !!opts.punct, !!opts.numbers));
  }
  return out;
}

export function buildWorkout(opts: {
  date: string;
  targets: string[];
  quotePack: Quote[];
}): { date: string; pieces: WorkoutPiece[] } {
  const { date, targets } = opts;
  const shorts = opts.quotePack.filter((q) => q.length === "short");
  const quote = shorts.length ? shorts[utcDayNumber(date) % shorts.length] : null;
  const pieces: WorkoutPiece[] = [
    {
      id: "warmup",
      kind: "warmup",
      config: {
        kind: "workout",
        mode: "time",
        durationSec: 30,
        punctuation: false,
        numbers: false,
        targetKeys: [],
        workoutId: date,
        pieceId: "warmup",
        seed: `${date}:warmup`,
      },
    },
    {
      id: "weak",
      kind: "weak",
      config: {
        kind: "workout",
        mode: "time",
        durationSec: 30,
        punctuation: false,
        numbers: false,
        targetKeys: targets,
        workoutId: date,
        pieceId: "weak",
        seed: `${date}:weak`,
      },
    },
    {
      id: "mixed",
      kind: "mixed",
      config: {
        kind: "workout",
        mode: "time",
        durationSec: 45,
        punctuation: false,
        numbers: false,
        targetKeys: targets,
        workoutId: date,
        pieceId: "mixed",
        seed: `${date}:mixed`,
      },
    },
  ];
  if (quote) {
    pieces.push({
      id: "quote",
      kind: "quote",
      config: {
        kind: "workout",
        mode: "quote",
        punctuation: false,
        numbers: false,
        targetKeys: [],
        quoteId: quote.id,
        workoutId: date,
        pieceId: "quote",
        seed: `${date}:quote`,
      },
    });
  }
  return { date, pieces };
}

export function dailyPassage(opts: {
  date: string;
  wordList: string[];
  quotePack: Quote[];
}): { kind: "words"; words: string[] } | { kind: "quote"; quoteId: string; text: string } {
  const dayNum = utcDayNumber(opts.date);
  if (dayNum % 7 === 0) {
    const medium = opts.quotePack.filter((q) => q.length === "medium");
    if (medium.length > 0) {
      const q = medium[dayNum % medium.length]!;
      return { kind: "quote", quoteId: q.id, text: q.text };
    }
  }
  return {
    kind: "words",
    words: generateWords({ list: opts.wordList, seed: `daily:${opts.date}`, n: 200 }),
  };
}

export function wordsForConfig(
  config: RunConfig,
  wordList: string[],
  quotePack: Quote[]
): string[] {
  if (config.mode === "quote" && config.quoteId) {
    const q = quotePack.find((x) => x.id === config.quoteId);
    return q ? q.text.split(/\s+/) : [];
  }
  const n =
    config.mode === "words"
      ? config.wordCount ?? 25
      : config.durationSec && config.durationSec >= 90
        ? 220
        : 160;
  const ratio = config.pieceId === "mixed" ? 0.3 : 0.6;
  return generateWords({
    list: wordList,
    seed: config.seed,
    n,
    targets: config.targetKeys,
    targetRatio: config.targetKeys.length ? ratio : 0,
    punct: config.punctuation,
    numbers: config.numbers,
  });
}

export function promptFromWords(words: string[]): string {
  return words.join(" ");
}

export function assertLogSane(prompt: string, log: Stroke[]): string | null {
  if (log.length === 0) return "empty_log";
  if (log.length > prompt.length + 80) return "log_too_long";
  for (const s of log) {
    if (!Number.isFinite(s.t) || s.t < 0) return "bad_t";
    if (s.expect.length > 1 || s.got.length > 1) return "bad_char";
  }
  return null;
}
