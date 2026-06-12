import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getObjectBuffer, putObject } from "@/lib/storage";
import {
  partPaths,
  validateAgainstManifest,
  type AvatarConfig,
  type PartsManifest,
} from "./avatar";

/**
 * Server-side avatar compositor. Part sheets all share the premade
 * character grid, so the personal spritesheet is a straight alpha-over
 * stack of the chosen layers (body < eyes < outfit < hair).
 *
 * Dev reads/writes the local runtime asset dir; prod reads/writes S3
 * (the part sheets are synced there by world-sync-assets.ts — the app
 * image has no assets-src).
 */

const RUNTIME_DIR = path.join(process.cwd(), "assets-src", "runtime", "world");
const isProd = process.env.NODE_ENV === "production";

async function readAsset(rel: string): Promise<Buffer> {
  if (isProd) return getObjectBuffer(`world/${rel}`);
  return fs.promises.readFile(path.join(RUNTIME_DIR, rel));
}

async function writeAsset(rel: string, data: Buffer): Promise<void> {
  if (isProd) {
    await putObject(`world/${rel}`, data, "image/png");
    return;
  }
  const abs = path.join(RUNTIME_DIR, rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, data);
}

export async function loadPartsManifest(): Promise<PartsManifest> {
  const buf = await readAsset("character-parts/manifest.json");
  return JSON.parse(buf.toString("utf8")) as PartsManifest;
}

/** Composite the config's layers and store the personal spritesheet at
 *  avatars/<userId>.png. Returns the asset-relative path.
 *  `extraOutfits` extends the manifest's starter wardrobe with styles
 *  the user has purchased (style → colors, from cosmetics.ts). */
export async function buildAvatarSheet(
  userId: string,
  config: AvatarConfig,
  extraOutfits: Record<string, string[]> = {}
): Promise<string> {
  const manifest = await loadPartsManifest();
  const problem = validateAgainstManifest(config, {
    ...manifest,
    outfits: { ...manifest.outfits, ...extraOutfits },
  });
  if (problem) throw new Error(problem);

  const [base, ...overlays] = await Promise.all(partPaths(config).map(readAsset));
  const sheet = await sharp(base)
    .composite(overlays.map((input) => ({ input })))
    .png()
    .toBuffer();

  const rel = `avatars/${userId}.png`;
  await writeAsset(rel, sheet);
  return rel;
}
