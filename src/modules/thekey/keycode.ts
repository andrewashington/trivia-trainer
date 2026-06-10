import {
  CURVE_INTENSITIES,
  CURVE_LATERALS,
  CURVE_VERTICALS,
  FORESKIN_STATUSES,
  GLANS_SHAPES,
  LENGTH_MM,
  GIRTH_MM,
  PUBIC_HAIR,
  SHAFT_PROFILES,
  VEIN_VISIBILITY,
} from "./schema";

/**
 * The key string: the whole card flattened to an ALMOST-readable code
 * like `l9c5h2s1f3g2v4d2w1b3` — the letter hints at the trait, the
 * number is the answer. Measurements are honest inches; everything
 * else is a 1-based option position only chart-holders can decode.
 *
 *   l  length (inches, rounded — tops out at 9)
 *   c  circumference (inches, rounded)
 *   h  head shape          s  shaft profile
 *   f  foreskin            g  groundskeeping (hair)
 *   v  veins               d  direction (curve up/down)
 *   w  which way (lean)    b  bend (curve intensity)
 *
 * Numbering is positional, so OPTION ARRAYS ARE APPEND-ONLY — reorder
 * or insert and every previously issued key silently changes meaning.
 */

type CodeAnswers = {
  lengthMm: number | null;
  girthMm: number | null;
  glansShape: string | null;
  shaftProfile: string | null;
  foreskinStatus: string | null;
  pubicHair: string | null;
  veinVisibility: string | null;
  curveVertical: string | null;
  curveLateral: string | null;
  curveIntensity: string | null;
};

function inches(mm: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, mm));
  return Math.round(clamped / 25.4);
}

const index = (list: readonly string[], v: string | null) =>
  v == null ? null : list.indexOf(v) + 1 || null;

export function buildKeyCode(a: CodeAnswers): string {
  const parts: [string, number | null][] = [
    ["l", a.lengthMm == null ? null : inches(a.lengthMm, LENGTH_MM.min, LENGTH_MM.max)],
    ["c", a.girthMm == null ? null : inches(a.girthMm, GIRTH_MM.min, GIRTH_MM.max)],
    ["h", index(GLANS_SHAPES, a.glansShape)],
    ["s", index(SHAFT_PROFILES, a.shaftProfile)],
    ["f", index(FORESKIN_STATUSES, a.foreskinStatus)],
    ["g", index(PUBIC_HAIR, a.pubicHair)],
    ["v", index(VEIN_VISIBILITY, a.veinVisibility)],
    ["d", index(CURVE_VERTICALS, a.curveVertical)],
    ["w", index(CURVE_LATERALS, a.curveLateral)],
    ["b", index(CURVE_INTENSITIES, a.curveIntensity)],
  ];
  return parts
    .filter(([, n]) => n != null)
    .map(([letter, n]) => `${letter}${n}`)
    .join("");
}
