import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { pixelIconSvg } from "@/components/icons";
import { moduleStyle, type CardSpec, type CardExtras } from "@/lib/discord/feed";

/**
 * Renders an outbox event as a brutalist UDM+ card PNG for Discord. The image
 * does the heavy lifting: type chip, headline/question, and the full body
 * (poll options, event when/where, listing price, …) in a tight hierarchy.
 * Live interaction (voting, RSVP, claim) and live counts live in the V2
 * components around it, so the PNG stays static. Compact + height-to-content so
 * one card doesn't swallow the channel.
 *
 * DURABILITY NOTE: Satori does not reliably reserve vertical space for a
 * variable-length text node in a flex column (its measured box can collapse,
 * letting the next row overlap it). So every block here gets an EXPLICIT pixel
 * height + px line-height + flexShrink:0, the headline's line count is estimated
 * from its length vs the content width, and the card's total height is the exact
 * sum of those. Nothing is left to auto-measurement, so any question / answer
 * length lays out without overlap.
 */

const W = 760;
const INK = "#101010";
const OUTER_PAD = 20;
const INNER_PAD_X = 28;
const INNER_PAD_TOP = 22;
const INNER_PAD_BOTTOM = 20;
const BORDER = 3;
const GAP = 14;

const CHIP_H = 30;
const BADGE_H = 30;
const FOOTER_H = 28;
const OPTION_ROW_H = 34;
const FACT_ROW_H = 32;
const ROW_GAP = 8;
const MORE_ROW_H = 24;

// Avatar-collage block (The Book): two sides of overlapping bettor faces.
const AVATAR_BLOCK_H = 64;
const AV_SIZE = 40;
const AV_OVERLAP = 12;

// Usable text width inside both paddings + the border, for line estimation.
const CONTENT_W = W - OUTER_PAD * 2 - INNER_PAD_X * 2 - BORDER * 2;

const MAX_OPTIONS = 6;
const MAX_FACTS = 4;

let fontCache: { display: Buffer; mono: Buffer } | null = null;
function fonts() {
  if (!fontCache) {
    const dir = path.join(process.cwd(), "public", "fonts");
    fontCache = {
      display: fs.readFileSync(path.join(dir, "space-grotesk-700.ttf")),
      mono: fs.readFileSync(path.join(dir, "space-mono-700.ttf")),
    };
  }
  return fontCache;
}

function iconDataUri(name: Parameters<typeof pixelIconSvg>[0], size: number, color: string) {
  return `data:image/svg+xml,${encodeURIComponent(pixelIconSvg(name, size, color))}`;
}

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Estimate wrapped line count from character count vs the content width. */
function estLines(text: string, fontSize: number, maxLines: number): number {
  const charsPerLine = Math.max(6, Math.floor(CONTENT_W / (fontSize * 0.56)));
  return Math.min(maxLines, Math.max(1, Math.ceil(text.length / charsPerLine)));
}

const WORDMARK: Array<{ ch: string; color: string; tilt: number }> = [
  { ch: "U", color: "#FF4D2E", tilt: -3 },
  { ch: "D", color: "#FFD60A", tilt: 2 },
  { ch: "M", color: "#2563FF", tilt: -2 },
  { ch: "+", color: "#3DDC4E", tilt: 3 },
];

export async function renderCardPng(
  spec: CardSpec,
  actorName: string | null,
  extras: CardExtras = {}
): Promise<Buffer> {
  const style = moduleStyle[spec.module];
  const sub = spec.sub.replace("{actor}", actorName ?? "someone");

  const headline = clamp(spec.headline, 84);
  const headlineSize = headline.length <= 28 ? 40 : headline.length <= 52 ? 32 : 26;
  const headlineLines = estLines(headline, headlineSize, 3);
  const headlineLinePx = Math.round(headlineSize * 1.22);
  const headlineH = headlineLines * headlineLinePx;

  const allOptions = extras.options ?? [];
  const options = allOptions.slice(0, MAX_OPTIONS);
  const moreOptions = allOptions.length - options.length;
  const facts = (extras.facts ?? []).slice(0, MAX_FACTS);

  const optionRows = options.length;
  const bodyH = optionRows
    ? optionRows * OPTION_ROW_H + (optionRows - 1) * ROW_GAP + (moreOptions > 0 ? ROW_GAP + MORE_ROW_H : 0)
    : facts.length
      ? facts.length * FACT_ROW_H + (facts.length - 1) * ROW_GAP
      : 0;

  const avatars = extras.avatars;
  const avatarsH = avatars ? AVATAR_BLOCK_H : 0;

  // Exact content height = chip + headline + optional badge + optional body +
  // optional avatar collage + footer, with one GAP between each present block.
  const content =
    CHIP_H +
    GAP +
    headlineH +
    (extras.badge ? GAP + BADGE_H : 0) +
    (bodyH ? GAP + bodyH : 0) +
    (avatarsH ? GAP + avatarsH : 0) +
    GAP +
    FOOTER_H;
  const H = OUTER_PAD * 2 + BORDER * 2 + INNER_PAD_TOP + INNER_PAD_BOTTOM + content + 4;

  const img = new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          backgroundColor: style.accent,
          padding: OUTER_PAD,
          fontFamily: "Space Grotesk",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            backgroundColor: "#FFFFFF",
            border: `${BORDER}px solid ${INK}`,
            boxShadow: `9px 9px 0 0 ${INK}`,
            transform: "rotate(-1deg)",
            padding: `${INNER_PAD_TOP}px ${INNER_PAD_X}px ${INNER_PAD_BOTTOM}px`,
            gap: GAP,
          }}
        >
          {/* top row: module chip + wordmark */}
          <div
            style={{
              display: "flex",
              height: CHIP_H,
              flexShrink: 0,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: CHIP_H,
                backgroundColor: style.accent,
                color: style.accentText,
                border: `2px solid ${INK}`,
                boxShadow: `2px 2px 0 0 ${INK}`,
                padding: "0 10px",
                transform: "rotate(-1deg)",
                fontSize: 15,
                lineHeight: `${CHIP_H}px`,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconDataUri(style.icon, 16, style.accentText)} width={16} height={16} alt="" />
              <span>{style.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", height: CHIP_H, fontSize: 24 }}>
              {WORDMARK.map((l) => (
                <span
                  key={l.ch}
                  style={{
                    color: l.color,
                    transform: `rotate(${l.tilt}deg)`,
                    textShadow: `2px 2px 0 ${INK}`,
                    marginLeft: 1,
                  }}
                >
                  {l.ch}
                </span>
              ))}
            </div>
          </div>

          {/* headline (the chip above already names the type — no kicker) */}
          <div
            style={{
              display: "flex",
              height: headlineH,
              flexShrink: 0,
              fontSize: headlineSize,
              fontWeight: 700,
              lineHeight: `${headlineLinePx}px`,
              color: INK,
              overflow: "hidden",
            }}
          >
            {headline}
          </div>

          {/* badge (price / poll mode) */}
          {extras.badge ? (
            <div style={{ display: "flex", height: BADGE_H, flexShrink: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: BADGE_H,
                  backgroundColor: style.accent,
                  color: style.accentText,
                  border: `2px solid ${INK}`,
                  padding: "0 12px",
                  fontFamily: "Space Mono",
                  fontSize: 18,
                  lineHeight: `${BADGE_H}px`,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {clamp(extras.badge, 22)}
              </div>
            </div>
          ) : null}

          {/* body: poll options as a lettered list */}
          {optionRows ? (
            <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, gap: ROW_GAP }}>
              {options.map((label, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", height: OPTION_ROW_H, gap: 12 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      flexShrink: 0,
                      backgroundColor: style.accent,
                      color: style.accentText,
                      border: `2px solid ${INK}`,
                      fontFamily: "Space Mono",
                      fontSize: 17,
                      lineHeight: "30px",
                    }}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                  <div style={{ display: "flex", fontSize: 22, lineHeight: `${OPTION_ROW_H}px`, color: INK }}>
                    {clamp(label, 46)}
                  </div>
                </div>
              ))}
              {moreOptions > 0 ? (
                <div
                  style={{
                    display: "flex",
                    height: MORE_ROW_H,
                    marginLeft: 42,
                    fontFamily: "Space Mono",
                    fontSize: 16,
                    lineHeight: `${MORE_ROW_H}px`,
                    opacity: 0.5,
                    color: INK,
                  }}
                >
                  +{moreOptions} more
                </div>
              ) : null}
            </div>
          ) : null}

          {/* body: labeled facts (when / where / detail) */}
          {!optionRows && facts.length ? (
            <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, gap: ROW_GAP }}>
              {facts.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", height: FACT_ROW_H, gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      width: 96,
                      flexShrink: 0,
                      fontFamily: "Space Mono",
                      fontSize: 15,
                      lineHeight: `${FACT_ROW_H}px`,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      color: INK,
                      opacity: 0.5,
                    }}
                  >
                    {f.label}
                  </div>
                  <div style={{ display: "flex", fontSize: 22, lineHeight: `${FACT_ROW_H}px`, color: INK }}>
                    {clamp(f.value, 44)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* avatar collage: bettors stacked on each side of the line */}
          {avatars ? (
            <div
              style={{
                display: "flex",
                height: AVATAR_BLOCK_H,
                flexShrink: 0,
                alignItems: "center",
                border: `3px solid ${INK}`,
                backgroundColor: "#F4F1EA",
              }}
            >
              {([
                ["YES", "#3DDC4E", avatars.yes, avatars.yesMore ?? 0, "flex-start"],
                ["NO", "#FF4D2E", avatars.no, avatars.noMore ?? 0, "flex-end"],
              ] as const).map(([label, color, faces, more, justify], side) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    width: "50%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: justify,
                    gap: 10,
                    padding: "0 14px",
                    flexDirection: side === 1 ? "row-reverse" : "row",
                    borderLeft: side === 1 ? `3px solid ${INK}` : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      height: 26,
                      alignItems: "center",
                      backgroundColor: color,
                      color: INK,
                      border: `2px solid ${INK}`,
                      padding: "0 8px",
                      fontFamily: "Space Mono",
                      fontSize: 15,
                      lineHeight: "26px",
                      letterSpacing: 1,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {faces.length === 0 ? (
                      <span
                        style={{
                          display: "flex",
                          fontFamily: "Space Mono",
                          fontSize: 15,
                          color: INK,
                          opacity: 0.4,
                        }}
                      >
                        no takers yet
                      </span>
                    ) : (
                      faces.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          width={AV_SIZE}
                          height={AV_SIZE}
                          alt=""
                          style={{
                            width: AV_SIZE,
                            height: AV_SIZE,
                            borderRadius: AV_SIZE,
                            border: `2px solid ${INK}`,
                            backgroundColor: "#FFFFFF",
                            marginLeft: i === 0 ? 0 : -AV_OVERLAP,
                          }}
                        />
                      ))
                    )}
                    {more > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: AV_SIZE,
                          height: AV_SIZE,
                          marginLeft: -AV_OVERLAP,
                          borderRadius: AV_SIZE,
                          border: `2px solid ${INK}`,
                          backgroundColor: "#FFFFFF",
                          fontFamily: "Space Mono",
                          fontSize: 14,
                          color: INK,
                        }}
                      >
                        +{more}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* footer: actor line */}
          <div style={{ display: "flex", alignItems: "center", height: FOOTER_H, flexShrink: 0, gap: 12 }}>
            <div
              style={{
                display: "flex",
                width: 22,
                height: 22,
                flexShrink: 0,
                backgroundColor: style.accent,
                border: `3px solid ${INK}`,
              }}
            />
            <div
              style={{
                display: "flex",
                fontFamily: "Space Mono",
                fontSize: 18,
                lineHeight: `${FOOTER_H}px`,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: INK,
              }}
            >
              {clamp(sub, 50)}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Space Grotesk", data: fonts().display, weight: 700 },
        { name: "Space Mono", data: fonts().mono, weight: 700 },
      ],
    }
  );

  return Buffer.from(await img.arrayBuffer());
}
