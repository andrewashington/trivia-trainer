import { z } from "zod";

/**
 * The Pump — shared workout programs.
 *
 * `planDoc` is the structured shape of a program (days → blocks → exercises)
 * stored in FitnessPlan.doc. Reps/load/rest are deliberately STRINGS: real
 * programs say "8-12", "AMRAP", "RPE 8", "70%", "top set" — flattening those
 * to numbers would lie. Only `sets` is numeric (workout mode counts them).
 */

export const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sets: z.number().int().min(1).max(30).nullish(),
  reps: z.string().trim().max(40).nullish(), // "8-12" | "5+" | "AMRAP" | "30s"
  load: z.string().trim().max(60).nullish(), // "225 lb" | "RPE 8" | "70%" | "bodyweight"
  rest: z.string().trim().max(40).nullish(), // "90s" | "2-3 min"
  notes: z.string().trim().max(300).nullish(),
});

export const blockSchema = z.object({
  /** Grouping label, e.g. "Superset A" / "Finisher". Null = plain list. */
  label: z.string().trim().max(60).nullish(),
  exercises: z.array(exerciseSchema).min(1).max(20),
});

export const daySchema = z.object({
  name: z.string().trim().min(1).max(80), // "Day 1 — Push"
  focus: z.string().trim().max(80).nullish(), // "chest/shoulders/triceps"
  blocks: z.array(blockSchema).min(1).max(12),
});

export const planDoc = z.object({
  days: z.array(daySchema).min(1).max(14),
});
export type PlanDoc = z.infer<typeof planDoc>;
export type PlanDay = z.infer<typeof daySchema>;
export type PlanExercise = z.infer<typeof exerciseSchema>;

export const fitnessPlanInput = z.object({
  title: z.string().trim().min(1, "Name the program").max(160),
  blurb: z.string().trim().max(240).nullish(),
  goal: z.string().trim().max(60).nullish(),
  daysPerWeek: z.number().int().min(1).max(7).nullish(),
  equipment: z.string().trim().max(80).nullish(),
  doc: planDoc,
  sourceText: z.string().max(50_000).nullish(),
  sourceUrl: z.string().trim().url().max(500).nullish(),
  aiUsed: z.boolean().optional().default(false),
});

export const fitnessPlanPatch = fitnessPlanInput.partial().extend({
  status: z.enum(["active", "retired"]).optional(),
});

/** POST /api/fitness/normalize — raw text or a URL, at least one. */
export const normalizeRequest = z
  .object({
    text: z.string().max(50_000).nullish(),
    url: z.string().trim().url().max(500).nullish(),
  })
  .refine((v) => (v.text ?? "").trim().length > 0 || !!v.url, {
    message: "Paste a program or a link to one.",
  });

/** POST /api/fitness/logs — a training session happened. */
export const fitnessLogInput = z.object({
  planId: z.string().nullish(),
  dayIndex: z.number().int().min(0).max(13).nullish(),
  note: z.string().trim().max(500).nullish(),
  durationMin: z.number().int().min(1).max(600).nullish(),
});

/** POST /api/fitness/prs — a claimed feat of strength. */
export const fitnessPrInput = z.object({
  lift: z.string().trim().min(1, "Name the lift").max(80),
  weight: z.number().positive().max(2000),
  reps: z.number().int().min(1).max(50).default(1),
  unit: z.enum(["lb", "kg"]).default("lb"),
  note: z.string().trim().max(200).nullish(),
});

/** Count every exercise in a doc — for card chips and confirmations. */
export function countLifts(doc: PlanDoc): number {
  return doc.days.reduce(
    (n, d) => n + d.blocks.reduce((m, b) => m + b.exercises.length, 0),
    0
  );
}
