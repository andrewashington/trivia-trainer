/**
 * One-shot: post The World beta launch announcement to Discord.
 * Composes a banner PNG from the real game assets (four avatar looks
 * in shop outfits on a grass strip) and sends it via the feed webhook.
 *
 *   railway run --service trivia-trainer npx tsx scripts/world-announce-discord.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PARTS = "assets-src/runtime/world/character-parts";
const W = 800;
const H = 420;
const SCALE = 7; // 16x32 frames → 112x224
const FRAME = { left: 18 * 16, top: 32, width: 16, height: 32 }; // idle-down

// Four looks that show off the shop: chef, hawaiian, ninja, gown.
const LOOKS = [
  { body: "01", eyes: "01", hair: "Hairstyle_01_01", outfit: "Outfit_09_01" },
  { body: "03", eyes: "03", hair: "Hairstyle_12_03", outfit: "Outfit_24_02" },
  { body: "05", eyes: "05", hair: null, outfit: "Outfit_30_01" },
  { body: "07", eyes: "02", hair: "Hairstyle_05_02", outfit: "Outfit_33_01" },
];

async function characterCrop(look: (typeof LOOKS)[number]): Promise<Buffer> {
  const layers = [
    `${PARTS}/bodies/Body_${look.body}.png`,
    `${PARTS}/eyes/Eyes_${look.eyes}.png`,
    `${PARTS}/outfits/${look.outfit}.png`,
    ...(look.hair ? [`${PARTS}/hairstyles/${look.hair}.png`] : []),
  ];
  for (const l of layers) if (!fs.existsSync(l)) throw new Error(`missing part: ${l}`);
  const [base, ...overlays] = layers;
  const sheet = await sharp(base)
    .composite(overlays.map((p) => ({ input: p })))
    .png()
    .toBuffer();
  return sharp(sheet)
    .extract(FRAME)
    .resize(16 * SCALE, 32 * SCALE, { kernel: "nearest" })
    .png()
    .toBuffer();
}

async function buildBanner(): Promise<Buffer> {
  const chars = await Promise.all(LOOKS.map(characterCrop));

  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#F4F1EA"/>
    <!-- grass strip -->
    <rect x="0" y="${H - 96}" width="${W}" height="96" fill="#2FBF71"/>
    <rect x="0" y="${H - 96}" width="${W}" height="6" fill="#101010"/>
    <!-- floating brutal confetti -->
    <rect x="640" y="40" width="26" height="26" fill="#FDE047" stroke="#101010" stroke-width="4" transform="rotate(12 653 53)"/>
    <rect x="700" y="120" width="18" height="18" fill="#FF4FA3" stroke="#101010" stroke-width="4" transform="rotate(-9 709 129)"/>
    <rect x="50" y="180" width="20" height="20" fill="#3AD6FF" stroke="#101010" stroke-width="4" transform="rotate(20 60 190)"/>
    <!-- title card -->
    <g transform="rotate(-1.5 60 60)">
      <rect x="44" y="44" width="436" height="150" fill="#101010"/>
      <rect x="36" y="36" width="436" height="150" fill="#FFFFFF" stroke="#101010" stroke-width="6"/>
      <text x="60" y="106" font-family="Menlo, monospace" font-size="58" font-weight="900" fill="#101010" letter-spacing="-2">THE WORLD</text>
      <text x="62" y="148" font-family="Menlo, monospace" font-size="20" font-weight="700" fill="#101010">a tiny walkable town, now in</text>
    </g>
    <!-- beta chip -->
    <g transform="rotate(3 575 92)">
      <rect x="500" y="70" width="150" height="44" fill="#FDE047" stroke="#101010" stroke-width="5"/>
      <text x="522" y="101" font-family="Menlo, monospace" font-size="28" font-weight="900" fill="#101010">BETA ✦</text>
    </g>
    <!-- tagline, standing on the grass -->
    <text x="36" y="356" font-family="Menlo, monospace" font-size="14" font-weight="700" fill="#101010">make an avatar ·</text>
    <text x="36" y="376" font-family="Menlo, monospace" font-size="14" font-weight="700" fill="#101010">wander with friends ·</text>
    <text x="36" y="396" font-family="Menlo, monospace" font-size="14" font-weight="700" fill="#101010">blow your coins at the shop</text>
  </svg>`);

  const charY = H - 32 * SCALE - 26; // feet planted in the grass
  return sharp(svg)
    .composite(chars.map((input, i) => ({ input, left: 330 + i * 116, top: charY })))
    .png()
    .toBuffer();
}

async function main() {
  const png = await buildBanner();
  fs.writeFileSync("/tmp/world-beta-banner.png", png); // for eyeballing
  if (process.argv.includes("--dry")) {
    console.log("dry run — banner written to /tmp/world-beta-banner.png, nothing posted");
    return;
  }
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not set — run via railway run --service trivia-trainer");

  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const content = [
    "🌍 **THE WORLD IS OPEN (beta)** 🌍",
    "",
    "UDM+ now contains a small video game. Make your pixel self, wander a tiny town with everyone else's ghosts, and meet the shopkeep — who has *opinions* and 28 outfits priced specifically to drain your coin balance.",
    "",
    "It's a beta: things will be weird, and that's part of the charm. Ideas + bug reports welcome (you know where the Ideas page is).",
    base ? `\n▶ ${base}/world` : "",
  ].join("\n");

  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content, allowed_mentions: { parse: [] } }));
  form.append("files[0]", new Blob([new Uint8Array(png)], { type: "image/png" }), "world-beta.png");

  const res = await fetch(webhook, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Discord said ${res.status}: ${await res.text()}`);
  console.log("✔ announcement posted to Discord (banner also at /tmp/world-beta-banner.png)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
