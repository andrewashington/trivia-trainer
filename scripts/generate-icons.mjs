/**
 * Generates the UDM+ PWA icons as PNGs using nothing but Node's stdlib
 * (zlib + manual PNG chunks). Run: node scripts/generate-icons.mjs
 *
 * Design: paper background, thick black frame, "UDM+" in chunky
 * bitmap letters — one accent color per letter, each with a hard black
 * drop shadow. Retro-cartridge energy at any size.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const PAPER = [0xf4, 0xf1, 0xea];
const INK = [0x10, 0x10, 0x10];
const RED = [0xff, 0x4d, 0x2e];
const YELLOW = [0xff, 0xd6, 0x0a];
const BLUE = [0x25, 0x63, 0xff];
const GREEN = [0x3d, 0xdc, 0x4e];

// 5x7 bitmap glyphs.
const GLYPHS = {
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
};

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // Each scanline is prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels[y * size + x];
      raw.set([r, g, b], row + 1 + x * 3);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { frame = true } = {}) {
  const px = new Array(size * size).fill(PAPER);
  const set = (x, y, color) => {
    if (x >= 0 && x < size && y >= 0 && y < size) px[y * size + x] = color;
  };
  const rect = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) set(x, y, color);
  };

  if (frame) {
    const bw = Math.max(2, Math.round(size * 0.045));
    rect(0, 0, size, bw, INK);
    rect(0, size - bw, size, bw, INK);
    rect(0, 0, bw, size, INK);
    rect(size - bw, 0, bw, size, INK);
  }

  // Letters laid out 2x2: U D / M +, each 5x7 cells.
  const letters = [
    { g: GLYPHS.U, color: RED, cx: 0, cy: 0 },
    { g: GLYPHS.D, color: YELLOW, cx: 1, cy: 0 },
    { g: GLYPHS.M, color: BLUE, cx: 0, cy: 1 },
    { g: GLYPHS["+"], color: GREEN, cx: 1, cy: 1 },
  ];
  const cell = Math.floor(size / 16); // glyph pixel size
  const glyphW = 5 * cell;
  const glyphH = 7 * cell;
  const gapX = Math.floor(cell * 1.6);
  const gapY = Math.floor(cell * 1.2);
  const totalW = glyphW * 2 + gapX;
  const totalH = glyphH * 2 + gapY;
  const originX = Math.floor((size - totalW) / 2);
  const originY = Math.floor((size - totalH) / 2);
  const shadow = Math.max(1, Math.floor(cell / 2));

  for (const { g, color, cx, cy } of letters) {
    const baseX = originX + cx * (glyphW + gapX);
    const baseY = originY + cy * (glyphH + gapY);
    // Hard offset shadow first, then the colored glyph on top.
    for (const [dx, dy, c] of [
      [shadow, shadow, INK],
      [0, 0, color],
    ]) {
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (g[gy][gx] !== "#") continue;
          rect(baseX + gx * cell + dx, baseY + gy * cell + dy, cell, cell, c);
        }
      }
    }
  }
  return px;
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", encodePng(192, drawIcon(192)));
writeFileSync("public/icons/icon-512.png", encodePng(512, drawIcon(512)));
// Maskable: no frame (the platform crops its own shape), same art.
writeFileSync(
  "public/icons/icon-maskable-512.png",
  encodePng(512, drawIcon(512, { frame: false }))
);
console.log("✓ icons written to public/icons/");
