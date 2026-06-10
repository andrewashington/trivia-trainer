/**
 * DiceBear avatars (dicebear.com). Default style is Open Peeps —
 * hand-drawn characters (by Pablo Stanley, CC0) that read great at
 * small sizes — but members can switch the whole base style too.
 *
 * Two ways an avatar is decided, in priority order:
 *   1. A structured config the user built (User.avatarConfig) — a
 *      style, a seed, and any pinned features. This is the source of
 *      truth; the server rebuilds the URL from it so we never trust a
 *      client-supplied URL.
 *   2. Nothing picked — the display name seeds the art, so the same
 *      person looks the same everywhere with zero plumbing.
 *
 * User.avatarUrl holds the rendered URL, denormalized from the config so
 * the render path (the <Avatar> component) stays a plain `src` string.
 *
 * Pinning semantics for the on/off parts (facial hair, accessories):
 *   undefined = leave it to the dice · "none" = force off ·
 *   a value = force exactly that one.
 */
export const DICEBEAR_STYLE = "open-peeps";

/** Curated base styles. Only open-peeps gets part-level controls. */
export const AVATAR_STYLES = [
  "open-peeps", "adventurer", "avataaars", "big-ears", "big-smile",
  "bottts", "croodles", "fun-emoji", "lorelei", "micah", "miniavs",
  "notionists", "personas", "pixel-art", "thumbs",
] as const;

/** Hair / head styles (Open Peeps `head`) — the full set. */
export const AVATAR_HEADS = [
  "afro", "bangs", "bangs2", "bantuKnots", "bear", "bun", "bun2", "buns",
  "cornrows", "cornrows2", "dreads1", "dreads2", "flatTop", "flatTopLong",
  "grayBun", "grayMedium", "grayShort", "hatBeanie", "hatHip", "hijab",
  "long", "longAfro", "longBangs", "longCurly", "medium1", "medium2",
  "medium3", "mediumBangs", "mediumBangs2", "mediumBangs3",
  "mediumStraight", "mohawk", "mohawk2", "noHair1", "noHair2", "noHair3",
  "pomp", "shaved1", "shaved2", "shaved3", "short1", "short2", "short3",
  "short4", "short5", "turban", "twists", "twists2",
] as const;

/** Expressions (Open Peeps `face`). */
export const AVATAR_FACES = [
  "angryWithFang", "awe", "blank", "calm", "cheeky", "concerned",
  "concernedFear", "contempt", "cute", "cyclops", "driven", "eatingHappy",
  "explaining", "eyesClosed", "fear", "hectic", "lovingGrin1",
  "lovingGrin2", "monster", "old", "rage", "serious", "smile", "smileBig",
  "smileLOL", "smileTeethGap", "solemn", "suspicious", "tired", "veryAngry",
] as const;

/** Facial hair (Open Peeps `facialHair`). */
export const AVATAR_FACIAL_HAIR = [
  "chin", "full", "full2", "full3", "full4", "goatee1", "goatee2",
  "moustache1", "moustache2", "moustache3", "moustache4", "moustache5",
  "moustache6", "moustache7", "moustache8", "moustache9",
] as const;

/** Accessories (Open Peeps `accessories`). */
export const AVATAR_ACCESSORIES = [
  "eyepatch", "glasses", "glasses2", "glasses3", "glasses4", "glasses5",
  "sunglasses", "sunglasses2",
] as const;

/** Hair color (Open Peeps `headContrastColor`; hex, no leading #). */
export const AVATAR_HAIR_COLORS = [
  "2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370", "ecdcbf",
  "e8e1e1", "f59797", "c93305",
] as const;

/** Open Peeps skin-tone palette (hex, no leading #). */
export const AVATAR_SKIN_COLORS = [
  "ffdbb4", "edb98a", "d08b5b", "ae5d29", "694d3d",
] as const;

/** Outfit color (Open Peeps `clothingColor`). */
export const AVATAR_CLOTHING_COLORS = [
  "e78276", "ffcf77", "fdea6b", "78e185", "9ddadb", "8fa7df", "e279c7",
] as const;

/** Soft backdrop palette. "" means a transparent (no) background. */
export const AVATAR_BACKGROUNDS = [
  "", "b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c5e9c0", "fef3c7",
] as const;

export type AvatarConfig = {
  seed: string;
  /** Base DiceBear style; defaults to open-peeps. */
  style?: string;
  // Open Peeps part pins (ignored for other styles):
  head?: string;
  face?: string;
  /** undefined = random · "none" = clean-shaven · value = pinned. */
  facialHair?: string;
  /** undefined = random · "none" = bare-faced · value = pinned. */
  accessory?: string;
  hairColor?: string;
  skinColor?: string;
  clothingColor?: string;
  /** "" or undefined = transparent. Applies to every style. */
  backgroundColor?: string;
};

/** Build the DiceBear URL for a structured config. */
export function avatarUrlFromConfig(config: AvatarConfig): string {
  const style = config.style ?? DICEBEAR_STYLE;
  const params = new URLSearchParams();
  params.set("seed", config.seed || "friend");
  if (config.backgroundColor) params.set("backgroundColor", config.backgroundColor);

  if (style === DICEBEAR_STYLE) {
    if (config.head) params.set("head", config.head);
    if (config.face) params.set("face", config.face);
    if (config.hairColor) params.set("headContrastColor", config.hairColor);
    if (config.skinColor) params.set("skinColor", config.skinColor);
    if (config.clothingColor) params.set("clothingColor", config.clothingColor);
    if (config.facialHair === "none") {
      params.set("facialHairProbability", "0");
    } else if (config.facialHair) {
      params.set("facialHair", config.facialHair);
      params.set("facialHairProbability", "100");
    }
    if (config.accessory === "none") {
      params.set("accessoriesProbability", "0");
    } else if (config.accessory) {
      params.set("accessories", config.accessory);
      params.set("accessoriesProbability", "100");
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

function pick(
  raw: unknown,
  allowed: readonly string[],
  extra: readonly string[] = []
): string | undefined {
  return typeof raw === "string" && (allowed.includes(raw) || extra.includes(raw))
    ? raw
    : undefined;
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

  const config: AvatarConfig = { seed };
  const style = pick(raw.style, AVATAR_STYLES);
  if (style && style !== DICEBEAR_STYLE) config.style = style;
  config.head = pick(raw.head, AVATAR_HEADS);
  config.face = pick(raw.face, AVATAR_FACES);
  config.facialHair = pick(raw.facialHair, AVATAR_FACIAL_HAIR, ["none"]);
  config.accessory = pick(raw.accessory, AVATAR_ACCESSORIES, ["none"]);
  config.hairColor = pick(raw.hairColor, AVATAR_HAIR_COLORS);
  config.skinColor = pick(raw.skinColor, AVATAR_SKIN_COLORS);
  config.clothingColor = pick(raw.clothingColor, AVATAR_CLOTHING_COLORS);
  if (
    typeof raw.backgroundColor === "string" &&
    (AVATAR_BACKGROUNDS as readonly string[]).includes(raw.backgroundColor)
  ) {
    config.backgroundColor = raw.backgroundColor;
  }
  return config;
}
