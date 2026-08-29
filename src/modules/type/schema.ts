import { z } from "zod";

export const sessionKind = z.enum(["placement", "workout", "daily", "sandbox", "targeted"]);
export const sessionMode = z.enum(["time", "words", "quote"]);

export const strokeSchema = z.object({
  t: z.number().finite().min(0).max(30 * 60_000),
  expect: z.string().max(1),
  got: z.string().max(1),
});

export const runConfigSchema = z.object({
  kind: sessionKind,
  mode: sessionMode,
  durationSec: z.number().int().min(15).max(180).optional(),
  wordCount: z.number().int().min(10).max(200).optional(),
  punctuation: z.boolean(),
  numbers: z.boolean(),
  targetKeys: z.array(z.string().length(1).regex(/[a-z]/)).max(26),
  quoteId: z.string().max(40).optional(),
  dailyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workoutId: z.string().max(40).optional(),
  pieceId: z.string().max(40).optional(),
  seed: z.string().min(1).max(80),
});

export const sessionSubmit = z.object({
  id: z.string().min(8).max(48).regex(/^[a-z0-9_-]+$/i),
  config: runConfigSchema,
  prompt: z.string().min(1).max(8_000),
  log: z.array(strokeSchema).min(1).max(8_000),
  durationMs: z.number().finite().min(800).max(30 * 60_000),
});

export type SessionSubmit = z.infer<typeof sessionSubmit>;
