import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { pixelIconSvg } from "@/components/icons";
import { moduleStyle, type CardSpec } from "@/lib/discord/feed";

/**
 * Renders an outbox event as a brutalist UDM+ card PNG for Discord.
 * Same design language as the app: paper ground, 3px ink borders,
 * hard offset shadows, accent chips, Space Grotesk / Space Mono, a
 * one-degree tilt, and the four-color wordmark.
 */

const W = 880;
const H = 460;

// Fonts ship in public/ (which the Dockerfile copies into the
// standalone image) so rendering never needs a network fetch.
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

const WORDMARK: Array<{ ch: string; color: string; tilt: number }> = [
  { ch: "U", color: "#FF4D2E", tilt: -3 },
  { ch: "D", color: "#FFD60A", tilt: 2 },
  { ch: "M", color: "#2563FF", tilt: -2 },
  { ch: "+", color: "#3DDC4E", tilt: 3 },
];

export async function renderCardPng(spec: CardSpec, actorName: string | null): Promise<Buffer> {
  const style = moduleStyle[spec.module];
  const sub = spec.sub.replace("{actor}", actorName ?? "someone");
  // Satori has no text-overflow ellipsis for multiline; clamp hard.
  const headline =
    spec.headline.length > 64 ? `${spec.headline.slice(0, 63).trimEnd()}…` : spec.headline;
  const headlineSize = headline.length > 34 ? 48 : 64;

  const img = new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          backgroundColor: style.accent,
          padding: "34px 44px",
          fontFamily: "Space Grotesk",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            backgroundColor: "#FFFFFF",
            border: "3px solid #101010",
            boxShadow: "10px 10px 0 0 #101010",
            transform: "rotate(-1deg)",
            padding: "30px 38px 26px",
          }}
        >
          {/* top row: module chip + wordmark */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                backgroundColor: style.accent,
                color: style.accentText,
                border: "3px solid #101010",
                boxShadow: "4px 4px 0 0 #101010",
                padding: "8px 18px",
                transform: "rotate(-1deg)",
                fontSize: 26,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconDataUri(style.icon, 30, style.accentText)} width={30} height={30} alt="" />
              <span>{style.label}</span>
            </div>
            <div style={{ display: "flex", fontSize: 44 }}>
              {WORDMARK.map((l) => (
                <span
                  key={l.ch}
                  style={{
                    color: l.color,
                    transform: `rotate(${l.tilt}deg)`,
                    textShadow: "3px 3px 0 #101010",
                    marginLeft: 2,
                  }}
                >
                  {l.ch}
                </span>
              ))}
            </div>
          </div>

          {/* kicker */}
          <div
            style={{
              display: "flex",
              marginTop: 34,
              fontFamily: "Space Mono",
              fontSize: 22,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#101010",
              opacity: 0.55,
            }}
          >
            {spec.kicker}
          </div>

          {/* headline */}
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: headlineSize,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: "#101010",
              flexGrow: 1,
            }}
          >
            {headline}
          </div>

          {/* footer: sub line on an accent underline bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                width: 26,
                height: 26,
                backgroundColor: style.accent,
                border: "3px solid #101010",
              }}
            />
            <div
              style={{
                display: "flex",
                fontFamily: "Space Mono",
                fontSize: 24,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "#101010",
              }}
            >
              {sub.length > 56 ? `${sub.slice(0, 55).trimEnd()}…` : sub}
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
