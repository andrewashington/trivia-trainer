/**
 * DiceBear avatars (dicebear.com), Open Peeps style — hand-drawn
 * characters (by Pablo Stanley, CC0) that read great at small sizes.
 * Avatars are deterministic by seed: with no custom pick, a user's
 * display name seeds their avatar, so the same person looks the same
 * everywhere with zero plumbing. A custom pick (generated during
 * onboarding or on the profile page) is stored as a full DiceBear URL
 * in User.avatarUrl.
 */
export const DICEBEAR_STYLE = "open-peeps";

export function dicebearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

/** Server-side check for URLs arriving via the API. */
export function isDicebearUrl(url: string): boolean {
  return /^https:\/\/api\.dicebear\.com\/9\.x\/[a-z0-9-]+\/svg\?seed=[^&]+$/.test(url);
}
