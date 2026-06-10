#!/usr/bin/env node
/**
 * Print the path data for icons from the vendored Pixelarticons Pro pack,
 * formatted as entries for the PATHS map in src/components/icons.tsx.
 *
 *   node scripts/icon.mjs heart heart-solid calendar-glyph
 *
 * Multi-<path> SVGs are concatenated into one `d` string (all pack paths
 * are plain fills, so this is safe).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("../vendor/pixelarticons-pro/svg", import.meta.url).pathname;

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: node scripts/icon.mjs <icon-name> [...]");
  console.error("variants: <name>-solid, <name>-glyph, <name>-sharp, <name>-off");
  process.exit(1);
}

for (const name of names) {
  let svg;
  try {
    svg = readFileSync(join(DIR, `${name}.svg`), "utf8");
  } catch {
    const close = readdirSync(DIR)
      .filter((f) => f.includes(name.split("-")[0]))
      .slice(0, 8)
      .map((f) => f.replace(/\.svg$/, ""));
    console.error(`✗ ${name} not found. Close matches: ${close.join(", ")}`);
    continue;
  }
  const d = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join(" ");
  console.log(`  "${name}": "${d}",`);
}
