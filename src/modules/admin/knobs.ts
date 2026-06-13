/**
 * Game-tuning knob registry — the declarative catalog the Economy tab renders
 * and persists. Pure (no db / no Node imports) so client and server can both
 * import it. Code ships the defaults; admin overrides live in AppConfig key
 * "knobs" as { [gameKey]: { [knobId]: value } }, and each game reads its
 * effective value at its decision site (see resolveKnobs / bank.ts).
 *
 * Adding a game = add a group here + read its values through getGameKnobs at
 * the decision point. Only list a knob once its read-site is wired, so the
 * panel never shows a lever that does nothing.
 */

export type KnobType = "int" | "float" | "bool";

export type KnobDef = {
  id: string;
  label: string;
  type: KnobType;
  default: number | boolean;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  /** Economy-sensitive — render with a warning tint. */
  danger?: boolean;
};

export type KnobGroup = {
  key: string;
  label: string;
  blurb: string;
  knobs: KnobDef[];
};

export const KNOB_REGISTRY: KnobGroup[] = [
  {
    key: "arcade",
    label: "Arcade house",
    blurb:
      "The shared economy behind Limbo, Mines, Crash, Slots and Blackjack bets. These are the real coin sinks — tune gently.",
    knobs: [
      {
        id: "houseEdge",
        label: "House edge",
        type: "float",
        default: 0.01,
        min: 0,
        max: 0.25,
        step: 0.005,
        help: "Cut baked into every payout. 0.01 = 1%. Higher drains coins faster.",
        danger: true,
      },
      { id: "minBet", label: "Minimum bet", type: "int", default: 1, min: 1, max: 1000 },
      {
        id: "maxBet",
        label: "Maximum bet",
        type: "int",
        default: 10_000,
        min: 1,
        max: 10_000_000,
        help: "Caps how much one tap can burn or mint.",
      },
      {
        id: "maxMultiplier",
        label: "Max multiplier",
        type: "int",
        default: 1000,
        min: 2,
        max: 1_000_000,
        help: "No single round mints more than this × the stake.",
        danger: true,
      },
    ],
  },
  {
    key: "treasure",
    label: "Treasure hunt",
    blurb: "The daily buried-chest pot. Unfound days roll their pot into the next, so cold streaks build a jackpot.",
    knobs: [
      {
        id: "basePot",
        label: "Base pot",
        type: "int",
        default: 500,
        min: 0,
        max: 1_000_000,
        help: "Coins seeded into each new day's chest before rollover.",
      },
      {
        id: "extraDigCost",
        label: "Extra dig cost",
        type: "int",
        default: 500,
        min: 0,
        max: 1_000_000,
        help: "First dig of the day is free; each extra costs this.",
      },
    ],
  },
];

/** Code defaults as a flat tree, for merging with overrides. */
export function knobDefaults(): Record<string, Record<string, number | boolean>> {
  const out: Record<string, Record<string, number | boolean>> = {};
  for (const g of KNOB_REGISTRY) {
    out[g.key] = Object.fromEntries(g.knobs.map((k) => [k.id, k.default]));
  }
  return out;
}

/** Merge admin overrides over the code defaults for one game group. */
export function resolveKnobs(
  game: string,
  overrides: Record<string, unknown> | null | undefined
): Record<string, number | boolean> {
  const group = KNOB_REGISTRY.find((g) => g.key === game);
  const base: Record<string, number | boolean> = {};
  if (group) for (const k of group.knobs) base[k.id] = k.default;
  if (overrides) {
    for (const [id, v] of Object.entries(overrides)) {
      if (typeof v === "number" || typeof v === "boolean") base[id] = v;
    }
  }
  return base;
}
