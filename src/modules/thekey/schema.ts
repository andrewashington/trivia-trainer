import { z } from "zod";

/**
 * The Key — the hidden field-guide quiz. Stored values are neutral and
 * non-ranking; the playful copy lives in option titles and the
 * server-computed archetype. A card is all-or-nothing: every question
 * must be answered to file — take the quiz or don't.
 */

export const GLANS_SHAPES = ["rounded", "bell", "flared", "tapered", "mushroom"] as const;
export const SHAFT_PROFILES = ["uniform", "fuller_base", "fuller_tip", "slim"] as const;
export const FORESKIN_STATUSES = ["circumcised", "uncut_partial", "uncut_full"] as const;
export const PUBIC_HAIR = ["bare", "trimmed", "natural", "wild"] as const;
export const VEIN_VISIBILITY = ["smooth", "subtle", "visible", "prominent"] as const;
export const CURVE_VERTICALS = ["straight", "up", "down"] as const;
export const CURVE_LATERALS = ["straight", "left", "right"] as const;
export const CURVE_INTENSITIES = ["straight", "slight", "moderate", "pronounced"] as const;

export type GlansShape = (typeof GLANS_SHAPES)[number];
export type ShaftProfile = (typeof SHAFT_PROFILES)[number];
export type ForeskinStatus = (typeof FORESKIN_STATUSES)[number];
export type PubicHair = (typeof PUBIC_HAIR)[number];
export type VeinVisibility = (typeof VEIN_VISIBILITY)[number];
export type CurveVertical = (typeof CURVE_VERTICALS)[number];
export type CurveLateral = (typeof CURVE_LATERALS)[number];
export type CurveIntensity = (typeof CURVE_INTENSITIES)[number];

// Bounds are a typo guard, not a judgement. Both scales top out at 9"
// — the last stop reads "9+" and that's all anyone needs to know.
export const LENGTH_MM = { min: 50, max: 229 } as const;
export const GIRTH_MM = { min: 50, max: 229 } as const;

export const keyInput = z
  .object({
    // All or nothing: a card is a complete card. No blanks, no
    // half-files — don't submit until every question has an answer.
    unitPreference: z.enum(["imperial", "metric"]).default("imperial"),
    lengthMm: z.number().int().min(LENGTH_MM.min).max(LENGTH_MM.max),
    girthMm: z.number().int().min(GIRTH_MM.min).max(GIRTH_MM.max),
    glansShape: z.enum(GLANS_SHAPES),
    shaftProfile: z.enum(SHAFT_PROFILES),
    foreskinStatus: z.enum(FORESKIN_STATUSES),
    pubicHair: z.enum(PUBIC_HAIR),
    veinVisibility: z.enum(VEIN_VISIBILITY),
    curveVertical: z.enum(CURVE_VERTICALS),
    curveLateral: z.enum(CURVE_LATERALS),
    curveIntensity: z.enum(CURVE_INTENSITIES),
    // Governs only the encoded key string on your profile (raw answers
    // are never shown to anyone). Default: the key shows.
    visibility: z.enum(["concealed", "group"]).default("group"),
  })
  .refine(
    // Straight on BOTH axes can't carry a bend amount, and vice versa.
    (a) =>
      a.curveIntensity !== "straight" ||
      ((a.curveVertical == null || a.curveVertical === "straight") &&
        (a.curveLateral == null || a.curveLateral === "straight")),
    {
      message: "No bend means no direction to bend in.",
      path: ["curveIntensity"],
    }
  )
  .refine(
    (a) =>
      !(a.curveVertical === "straight" && a.curveLateral === "straight") ||
      a.curveIntensity == null ||
      a.curveIntensity === "straight",
    {
      message: "Straight as an arrow can't also be bent — pick one story.",
      path: ["curveIntensity"],
    }
  );

export type KeyAnswers = z.infer<typeof keyInput>;

/** Human-friendly titles, mirrored client + server. */
export const OPTION_TITLES = {
  glansShape: {
    rounded: "Rounded",
    bell: "Bell",
    flared: "Flared crown",
    tapered: "Tapered tip",
    mushroom: "Mushroom",
  },
  shaftProfile: {
    uniform: "Even all the way",
    fuller_base: "Fuller at the base",
    fuller_tip: "Fuller toward the tip",
    slim: "Slim",
  },
  foreskinStatus: {
    circumcised: "Circumcised (cut)",
    uncut_partial: "Uncut — partial cover",
    uncut_full: "Uncut — full cover",
  },
  pubicHair: {
    bare: "Bare",
    trimmed: "Trimmed",
    natural: "Natural",
    wild: "Wild",
  },
  veinVisibility: {
    smooth: "Smooth",
    subtle: "Subtle",
    visible: "Visible",
    prominent: "Prominent",
  },
  curveVertical: {
    straight: "Level",
    up: "Curves up",
    down: "Curves down",
  },
  curveLateral: {
    straight: "Dead center",
    left: "Leans left",
    right: "Leans right",
  },
  curveIntensity: {
    straight: "None / straight",
    slight: "Slight",
    moderate: "Moderate",
    pronounced: "Pronounced",
  },
} as const;

/**
 * Card subtitles: a positive spin per option, so nothing reads as the
 * "worse" pick. Every trait is a feature, not a grade.
 */
export const OPTION_SUBTITLES = {
  glansShape: {
    rounded: "The classic silhouette",
    bell: "Rings with confidence",
    flared: "Built-in drama",
    tapered: "Aerodynamic by design",
    mushroom: "Maximum canopy",
  },
  shaftProfile: {
    uniform: "Consistency is a virtue",
    fuller_base: "Strong foundations",
    fuller_tip: "Saves the best for last",
    slim: "Precision instrument",
  },
  foreskinStatus: {
    circumcised: "The open-air model",
    uncut_partial: "Convertible top",
    uncut_full: "Original packaging intact",
  },
  pubicHair: {
    bare: "Hydrodynamic finish",
    trimmed: "A curated hedgerow",
    natural: "As nature intended",
    wild: "Protected old-growth",
  },
  veinVisibility: {
    smooth: "Polished marble",
    subtle: "A hint of texture",
    visible: "Topographic character",
    prominent: "Fully mapped river system",
  },
  curveVertical: {
    straight: "Laser-levelled",
    up: "Ambitious trajectory",
    down: "Dives with purpose",
  },
  curveLateral: {
    straight: "Perfect alignment",
    left: "Sets its own course",
    right: "Takes the scenic exit",
  },
  curveIntensity: {
    straight: "No notes",
    slight: "A tasteful flourish",
    moderate: "Committed to the bit",
    pronounced: "A signature move",
  },
} as const;

/** Display band, derived at render time — the band is never stored. */
export function inchBand(mm: number): string {
  const inches = mm / 25.4;
  const lo = Math.max(3, Math.floor(inches));
  return inches >= 11 ? "11+ inches" : `${lo} to ${lo + 1} inches`;
}

export function formatMm(mm: number, unit: "imperial" | "metric"): string {
  if (unit === "metric") return `${(mm / 10).toFixed(1)} cm`;
  return `${(mm / 25.4).toFixed(2)}"`;
}
