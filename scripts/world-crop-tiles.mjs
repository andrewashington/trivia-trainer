// usage: node crop.mjs <sheet.png> <colStart> <rowStart> <cols> <rows> <scale> <out.png>
// crops a tile-aligned region, upscales (nearest), draws gridlines every tile
// and thick lines every 4 tiles, on a magenta backdrop so transparent tiles show.
import sharp from "sharp";
const [sheet, c0, r0, cw, rh, scale, out] = process.argv.slice(2);
const [C0, R0, CW, RH, S] = [c0, r0, cw, rh, scale].map(Number);
const W = CW * 16 * S, H = RH * 16 * S;
const lines = [];
for (let i = 0; i <= CW; i++) {
  const x = i * 16 * S, major = (C0 + i) % 4 === 0;
  lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${major ? "red" : "black"}" stroke-width="${major ? 2 : 1}" opacity="0.6"/>`);
  if (major && i < CW) lines.push(`<text x="${x + 2}" y="12" font-size="11" fill="red">${C0 + i}</text>`);
}
for (let j = 0; j <= RH; j++) {
  const y = j * 16 * S, major = (R0 + j) % 4 === 0;
  lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${major ? "red" : "black"}" stroke-width="${major ? 2 : 1}" opacity="0.6"/>`);
  if (major && j < RH) lines.push(`<text x="2" y="${y + 13}" font-size="11" fill="red">${R0 + j}</text>`);
}
const grid = Buffer.from(`<svg width="${W}" height="${H}">${lines.join("")}</svg>`);
const tile = await sharp(sheet)
  .extract({ left: C0 * 16, top: R0 * 16, width: CW * 16, height: RH * 16 })
  .resize(W, H, { kernel: "nearest" })
  .toBuffer();
await sharp({ create: { width: W, height: H, channels: 4, background: "#ff00ff" } })
  .composite([{ input: tile }, { input: grid }])
  .png()
  .toFile(out);
console.log(out, `${W}x${H}`);
