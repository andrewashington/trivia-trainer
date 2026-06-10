import { STYLE_OPTIONS, type StyleOption } from "@/lib/avatar-options";

/**
 * DiceBear avatars (dicebear.com). Default style is Open Peeps —
 * hand-drawn characters (by Pablo Stanley, CC0) — but members can
 * switch the base style, and EVERY style is customizable part by part:
 * the available options per style live in src/lib/avatar-options.ts,
 * generated from DiceBear's own JSON schemas.
 *
 * Two ways an avatar is decided, in priority order:
 *   1. A structured config the user built (User.avatarConfig) — a
 *      style, a seed, and pinned options. This is the source of truth;
 *      the server rebuilds the URL from it so we never trust a
 *      client-supplied URL.
 *   2. Nothing picked — the display name seeds the art, so the same
 *      person looks the same everywhere with zero plumbing.
 *
 * User.avatarUrl holds the rendered URL, denormalized from the config so
 * the render path (the <Avatar> component) stays a plain `src` string.
 *
 * Pinning semantics per option:
 *   absent = leave it to the dice · "none" = force off (only for parts
 *   with a probability knob) · a value = force exactly that one.
 */
export const DICEBEAR_STYLE = "open-peeps";

export const AVATAR_STYLES = Object.keys(STYLE_OPTIONS);

/** Soft backdrop palette. "" means a transparent (no) background. */
export const AVATAR_BACKGROUNDS = [
  "", "b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c5e9c0", "fef3c7",
] as const;

export type AvatarConfig = {
  seed: string;
  /** Base DiceBear style; defaults to open-peeps. */
  style?: string;
  /** "" or undefined = transparent. Applies to every style. */
  backgroundColor?: string;
  /** Pinned per-style options: option name -> value (or "none"). */
  options?: Record<string, string>;
};

export function styleOptions(style: string): Record<string, StyleOption> {
  return STYLE_OPTIONS[style] ?? {};
}

/** Build the DiceBear URL for a structured config. */
export function avatarUrlFromConfig(config: AvatarConfig): string {
  const style = config.style ?? DICEBEAR_STYLE;
  const params = new URLSearchParams();
  params.set("seed", config.seed || "friend");
  if (config.backgroundColor) params.set("backgroundColor", config.backgroundColor);

  const defs = styleOptions(style);
  for (const [name, value] of Object.entries(config.options ?? {})) {
    const def = defs[name];
    if (!def) continue;
    if (def.kind === "enum" && def.hasProbability && value === "none") {
      params.set(`${name}Probability`, "0");
    } else if (def.values.includes(value)) {
      params.set(name, value);
      if (def.kind === "enum" && def.hasProbability) {
        params.set(`${name}Probability`, "100");
      }
    }
  }

  return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}`;
}

/** A name-seeded starting config — every new member gets a face. */
export function defaultAvatarConfig(name: string): AvatarConfig {
  return { seed: name.trim() || "friend" };
}

/** The simplest URL: just a seed, no pinned features (used as a fallback). */
export function dicebearUrl(seed: string): string {
  return avatarUrlFromConfig({ seed });
}

/**
 * Earlier configs pinned open-peeps parts as top-level fields. Fold
 * them into the generic options map so old saves keep rendering.
 */
const LEGACY_KEYS: Record<string, string> = {
  head: "head",
  face: "face",
  facialHair: "facialHair",
  accessory: "accessories",
  hairColor: "headContrastColor",
  skinColor: "skinColor",
  clothingColor: "clothingColor",
};

/**
 * Validate an untrusted config (from the API or the DB) against the
 * per-style allow-lists. Returns a clean config, or null if anything
 * is off. The server uses this, then rebuilds the URL itself — a
 * client never sets avatarUrl.
 */
export function parseAvatarConfig(input: unknown): AvatarConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const seed = typeof raw.seed === "string" ? raw.seed.trim().slice(0, 100) : "";
  if (!seed) return null;

  const config: AvatarConfig = { seed };
  const style =
    typeof raw.style === "string" && AVATAR_STYLES.includes(raw.style)
      ? raw.style
      : DICEBEAR_STYLE;
  if (style !== DICEBEAR_STYLE) config.style = style;

  if (
    typeof raw.backgroundColor === "string" &&
    (AVATAR_BACKGROUNDS as readonly string[]).includes(raw.backgroundColor)
  ) {
    config.backgroundColor = raw.backgroundColor;
  }

  // Candidate pins: the generic options map, plus legacy top-level keys.
  const candidates: Record<string, unknown> = {};
  if (raw.options && typeof raw.options === "object") {
    Object.assign(candidates, raw.options as Record<string, unknown>);
  }
  for (const [legacy, optionName] of Object.entries(LEGACY_KEYS)) {
    if (typeof raw[legacy] === "string") candidates[optionName] = raw[legacy];
  }

  const defs = styleOptions(style);
  const options: Record<string, string> = {};
  for (const [name, value] of Object.entries(candidates)) {
    const def = defs[name];
    if (!def || typeof value !== "string") continue;
    const allowNone = def.kind === "enum" && def.hasProbability;
    if (def.values.includes(value) || (allowNone && value === "none")) {
      options[name] = value;
    }
  }
  if (Object.keys(options).length > 0) config.options = options;

  return config;
}
