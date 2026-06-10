/**
 * DiceBear avatars (dicebear.com), Open Peeps style — hand-drawn
 * characters (by Pablo Stanley, CC0) that read great at small sizes.
 *
 * Two ways an avatar is decided, in priority order:
 *   1. A structured config the user built (User.avatarConfig) — a seed
 *      plus a few pinned features (hair, skin tone, backdrop). This is
 *      the source of truth; the server rebuilds the URL from it so we
 *      never trust a client-supplied URL.
 *   2. Nothing picked — the display name seeds the art, so the same
 *      person looks the same everywhere with zero plumbing.
 *
 * User.avatarUrl holds the rendered URL, denormalized from the config so
 * the render path (the <Avatar> component) stays a plain `src` string.
 */
export const DICEBEAR_STYLE = "open-peeps";

/** Hair / head styles offered in the lightweight builder (Open Peeps `head`). */
export const AVATAR_HEADS = [
  "afro", "bangs", "bantuKnots", "bun", "buns", "cornrows", "dreads1",
  "dreads2", "flatTop", "hatBeanie", "hatHip", "hijab", "long", "longAfro",
  "longCurly", "medium1", "mediumStraight", "mohawk", "noHair1", "pomp",
  "shaved1", "short1", "short3", "turban", "twists",
] as const;

/** Open Peeps skin-tone palette (hex, no leading #). */
export const AVATAR_SKIN_COLORS = [
  "ffdbb4", "edb98a", "d08b5b", "ae5d29", "694d3d",
] as const;

/** Soft backdrop palette. "" means a transparent (no) background. */
export const AVATAR_BACKGROUNDS = [
  "", "b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c5e9c0", "fef3c7",
] as const;

export type AvatarConfig = {
  seed: string;
  head?: string;
  skinColor?: string;
  /** "" or undefined = transparent. */
  backgroundColor?: string;
};

/** Build the DiceBear URL for a structured config. */
export function avatarUrlFromConfig(config: AvatarConfig): string {
  const params = new URLSearchParams();
  params.set("seed", config.seed || "friend");
  if (config.head) params.set("head", config.head);
  if (config.skinColor) params.set("skinColor", config.skinColor);
  if (config.backgroundColor) params.set("backgroundColor", config.backgroundColor);
  return `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/svg?${params.toString()}`;
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
 * Validate an untrusted config (from the API) against the allow-lists.
 * Returns a clean config, or null if anything is off. The server uses
 * this, then rebuilds the URL itself — a client never sets avatarUrl.
 */
export function parseAvatarConfig(input: unknown): AvatarConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const seed = typeof raw.seed === "string" ? raw.seed.trim().slice(0, 100) : "";
  if (!seed) return null;

  const heads = AVATAR_HEADS as readonly string[];
  const skins = AVATAR_SKIN_COLORS as readonly string[];
  const backgrounds = AVATAR_BACKGROUNDS as readonly string[];

  const config: AvatarConfig = { seed };
  if (typeof raw.head === "string" && heads.includes(raw.head)) config.head = raw.head;
  if (typeof raw.skinColor === "string" && skins.includes(raw.skinColor)) config.skinColor = raw.skinColor;
  if (typeof raw.backgroundColor === "string" && backgrounds.includes(raw.backgroundColor)) {
    config.backgroundColor = raw.backgroundColor;
  }
  return config;
}
