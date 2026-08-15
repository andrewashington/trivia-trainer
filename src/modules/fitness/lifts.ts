/**
 * Canonical lift names, so "BB Bench", "bench", and "flat bench press" all
 * land on one PR history. Same trick as home-plus's pantry matcher:
 * deterministic normalization (no AI in the hot path) + a curated alias map.
 * `e1rm` is the Epley estimate — weight × (1 + reps/30) — stored normalized
 * to POUNDS so kg and lb entries compare on one leaderboard.
 */

const NOISE_WORDS = new Set([
  "barbell", "bb", "dumbbell", "db", "machine", "smith", "cable", "band",
  "flat", "seated", "standing", "strict", "paused", "pause", "touch", "go",
  "heavy", "working", "top", "single", "max", "1rm", "the", "a", "day",
]);

/** canonical name → the aliases that should collapse into it (pre-normalized). */
const ALIASES: Record<string, string[]> = {
  "bench press": ["bench", "benchpress", "chest press"],
  "incline bench press": ["incline bench", "incline press", "incline"],
  "overhead press": ["ohp", "military press", "shoulder press", "press"],
  "deadlift": ["dead", "deads", "dl", "conventional deadlift"],
  "romanian deadlift": ["rdl", "romanian dl", "stiff leg deadlift", "sldl"],
  "squat": ["back squat", "squats", "low bar squat", "high bar squat"],
  "front squat": ["front squats"],
  "pull-up": ["pullup", "pull up", "pull ups", "pullups"],
  "chin-up": ["chinup", "chin up", "chin ups", "chinups"],
  "barbell row": ["bent over row", "bent-over row", "row", "rows", "pendlay row"],
  "hip thrust": ["hip thrusts", "glute bridge"],
  "lat pulldown": ["pulldown", "pulldowns", "lat pull down"],
  "leg press": ["leg presses"],
  "dip": ["dips", "weighted dip", "weighted dips"],
  "curl": ["curls", "bicep curl", "biceps curl", "bicep curls"],
};

const ALIAS_LOOKUP = new Map<string, string>();
for (const [canon, aliases] of Object.entries(ALIASES)) {
  ALIAS_LOOKUP.set(canon, canon);
  for (const a of aliases) ALIAS_LOOKUP.set(a, canon);
}

/** "BB Bench  (paused)" → "bench press". Falls back to the cleaned string. */
export function normalizeLift(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ALIAS_LOOKUP.has(cleaned)) return ALIAS_LOOKUP.get(cleaned)!;
  const words = cleaned.split(" ").filter((w) => w && !NOISE_WORDS.has(w));
  const key = words.join(" ") || cleaned;
  return ALIAS_LOOKUP.get(key) ?? key;
}

const LB_PER_KG = 2.2046226218;

export function toLb(weight: number, unit: string): number {
  return unit === "kg" ? weight * LB_PER_KG : weight;
}

/** Epley estimated 1-rep max, in POUNDS regardless of the entry's unit. */
export function e1rmLb(weight: number, reps: number, unit: string): number {
  const lb = toLb(weight, unit);
  const est = reps <= 1 ? lb : lb * (1 + reps / 30);
  return Math.round(est * 10) / 10;
}

/** "225 lb × 5" / "100 kg × 1" — display form for a PR entry. */
export function prDisplay(weight: number, reps: number, unit: string): string {
  const w = Number.isInteger(weight) ? weight : weight.toFixed(1);
  return reps <= 1 ? `${w} ${unit}` : `${w} ${unit} × ${reps}`;
}
