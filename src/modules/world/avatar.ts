import { z } from "zod";

/**
 * World avatar config — v1 categories only (accessories etc. arrive with
 * the in-game store). Values are the zero-padded ids from the part
 * manifest (character-parts/manifest.json), e.g. body "03", hair style
 * "12" color "04".
 */
export const avatarConfigSchema = z.object({
  body: z.string().regex(/^\d{2}$/),
  eyes: z.string().regex(/^\d{2}$/),
  hair: z
    .object({ style: z.string().regex(/^\d{2}$/), color: z.string().regex(/^\d{2}$/) })
    .nullable(), // bald is a valid lifestyle
  outfit: z.object({
    style: z.string().regex(/^\d{2}$/),
    color: z.string().regex(/^\d{2}$/),
  }),
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export type PartsManifest = {
  bodies: string[];
  eyes: string[];
  hairstyles: Record<string, string[]>;
  outfits: Record<string, string[]>;
};

/** Relative paths (under the runtime world asset root) of a config's
 *  part sheets, in compositing order (bottom → top). */
export function partPaths(config: AvatarConfig): string[] {
  const paths = [
    `character-parts/bodies/Body_${config.body}.png`,
    `character-parts/eyes/Eyes_${config.eyes}.png`,
    `character-parts/outfits/Outfit_${config.outfit.style}_${config.outfit.color}.png`,
  ];
  if (config.hair) {
    paths.push(`character-parts/hairstyles/Hairstyle_${config.hair.style}_${config.hair.color}.png`);
  }
  return paths;
}

/** Validate that every referenced part exists in the manifest. */
export function validateAgainstManifest(config: AvatarConfig, m: PartsManifest): string | null {
  if (!m.bodies.includes(config.body)) return `Unknown body ${config.body}`;
  if (!m.eyes.includes(config.eyes)) return `Unknown eyes ${config.eyes}`;
  if (config.hair && !m.hairstyles[config.hair.style]?.includes(config.hair.color))
    return `Unknown hairstyle ${config.hair.style}/${config.hair.color}`;
  if (!m.outfits[config.outfit.style]?.includes(config.outfit.color))
    return `Unknown outfit ${config.outfit.style}/${config.outfit.color}`;
  return null;
}
