import type { KeyAnswers } from "./schema";

/**
 * The payoff. No leaderboard, no score — the trait mix maps to an
 * archetype that celebrates the combination. Always affirming, never
 * comparative. Computed server-side only; clients can't submit one.
 */
export type Archetype = {
  id: string;
  label: string;
  blurb: string;
};

type Rule = {
  archetype: Archetype;
  matches: (a: KeyAnswers) => boolean;
};

const bends = (v: string | null | undefined) => v != null && v !== "straight";

// First match wins — most specific combinations up top.
const RULES: Rule[] = [
  {
    archetype: {
      id: "corkscrew",
      label: "The Limited Edition 🌀",
      blurb: "Curves on two axes — a custom build they simply don't mass-produce.",
    },
    matches: (a) => bends(a.curveVertical) && bends(a.curveLateral),
  },
  {
    archetype: {
      id: "cartographers_dream",
      label: "The Cartographer's Dream 🗺️",
      blurb: "Pronounced curve, prominent veins — every route is the scenic route.",
    },
    matches: (a) =>
      a.curveIntensity === "pronounced" && a.veinVisibility === "prominent",
  },
  {
    archetype: {
      id: "optimist",
      label: "The Optimist 📈",
      blurb: "Curves up and means it. Forecast: bullish.",
    },
    matches: (a) =>
      a.curveVertical === "up" &&
      (a.curveIntensity === "moderate" || a.curveIntensity === "pronounced"),
  },
  {
    archetype: {
      id: "dowsing_rod",
      label: "The Treasure Seeker 🪄",
      blurb: "Points straight at the good stuff. Has never once missed.",
    },
    matches: (a) =>
      a.curveVertical === "down" &&
      (a.curveIntensity === "moderate" || a.curveIntensity === "pronounced"),
  },
  {
    archetype: {
      id: "turn_signal",
      label: "The Trailblazer 🧭",
      blurb: "Charts its own route — and the route is always correct.",
    },
    matches: (a) =>
      bends(a.curveLateral) && a.curveIntensity !== "slight" && a.curveIntensity != null,
  },
  {
    archetype: {
      id: "power_plant",
      label: "The Power Plant 🍄",
      blurb: "Mushroom crown, full send. Mario would risk it all.",
    },
    matches: (a) => a.glansShape === "mushroom",
  },
  {
    archetype: {
      id: "cathedral",
      label: "The Cathedral 🔔",
      blurb: "Bell-shaped and built to last. Rings true.",
    },
    matches: (a) => a.glansShape === "bell" || a.glansShape === "flared",
  },
  {
    archetype: {
      id: "turtleneck",
      label: "The Turtleneck 🧣",
      blurb: "Full coverage, all seasons. Effortlessly European.",
    },
    matches: (a) => a.foreskinStatus === "uncut_full",
  },
  {
    archetype: {
      id: "wilderness",
      label: "The Ranger 🌲",
      blurb: "Natural habitat, untouched canopy. Bring a compass.",
    },
    matches: (a) => a.pubicHair === "wild",
  },
  {
    archetype: {
      id: "showroom",
      label: "The Showroom ✨",
      blurb: "Bare, detailed, buffed. Please do not touch the exhibits (do).",
    },
    matches: (a) => a.pubicHair === "bare",
  },
  {
    archetype: {
      id: "anchor",
      label: "The Anchor ⚓",
      blurb: "Fuller at the base — sturdy foundations, won't drift in a storm.",
    },
    matches: (a) => a.shaftProfile === "fuller_base",
  },
  {
    archetype: {
      id: "exclamation",
      label: "The Exclamation Point ❗",
      blurb: "Fuller toward the tip. Ends every sentence with emphasis.",
    },
    matches: (a) => a.shaftProfile === "fuller_tip",
  },
  {
    archetype: {
      id: "rapier",
      label: "The Rapier 🤺",
      blurb: "Slim, precise, en garde. A fencer's weapon, not a club.",
    },
    matches: (a) => a.shaftProfile === "slim",
  },
  {
    archetype: {
      id: "standard_issue",
      label: "The Gold Standard 📏",
      blurb: "Straight, even, smooth — the reference unit others are measured against.",
    },
    matches: (a) =>
      a.curveVertical === "straight" &&
      a.curveLateral === "straight" &&
      a.shaftProfile === "uniform" &&
      (a.veinVisibility === "smooth" || a.veinVisibility === "subtle"),
  },
  {
    archetype: {
      id: "gentle_curve",
      label: "The Gentle Curve 🌙",
      blurb: "A slight lean, like good italics. Adds character to the font.",
    },
    matches: (a) => a.curveIntensity === "slight",
  },
];

const FALLBACK: Archetype = {
  id: "classified",
  label: "The Classified File 🗂️",
  blurb: "The lab needs more data. Mysterious is also a vibe.",
};

export function computeArchetype(a: KeyAnswers): Archetype {
  return RULES.find((r) => r.matches(a))?.archetype ?? FALLBACK;
}
