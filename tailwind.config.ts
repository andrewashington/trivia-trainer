import type { Config } from "tailwindcss";

/**
 * UDM+ retro-brutalist design tokens.
 *
 * Paper background, pure-white cards, thick black borders, hard offset
 * shadows with zero blur. Loud flat accents — one per module:
 *   cookbook = hot red/orange, events = electric blue,
 *   nowplaying = acid yellow, files = slime green, admin = grape.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F1EA",
        ink: "#101010",
        card: "#FFFFFF",
        accent: {
          blue: "#2563FF",
          red: "#FF4D2E",
          yellow: "#FFD60A",
          green: "#3DDC4E",
          grape: "#9B5DE5",
          cyan: "#00CFE8",
          pink: "#FF6FB5",
          orange: "#FF9F1C",
          teal: "#16C2A3",
          lime: "#B5E631",
          magenta: "#E0218A",
          indigo: "#6A5CFF",
          forest: "#0B9E63",
          sky: "#38BDF8",
        },
      },
      fontFamily: {
        display: [
          "Space Grotesk",
          "Arial Black",
          "Helvetica Neue",
          "system-ui",
          "sans-serif",
        ],
        body: ["Inter", "Helvetica Neue", "Arial", "system-ui", "sans-serif"],
        mono: ["Space Mono", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        brutal: "4px 4px 0 0 #101010",
        "brutal-sm": "2px 2px 0 0 #101010",
        "brutal-lg": "8px 8px 0 0 #101010",
        "brutal-pressed": "1px 1px 0 0 #101010",
      },
      borderWidth: {
        "3": "3px",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.96) translateY(4px)", opacity: "0" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-1.5deg)" },
          "50%": { transform: "rotate(1.5deg)" },
        },
        hop: {
          "0%, 100%": { transform: "translateY(0)" },
          "30%": { transform: "translateY(-14px) rotate(-4deg)" },
          "60%": { transform: "translateY(0)" },
        },
        blockblink: {
          "0%, 100%": { opacity: "0.15" },
          "40%": { opacity: "1" },
        },
        "stamp-in": {
          "0%": { transform: "scale(2.6) rotate(-18deg)", opacity: "0" },
          "55%": { transform: "scale(0.92) rotate(-8deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(-8deg)", opacity: "1" },
        },
        "card-out": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.94) translateY(8px)", opacity: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-ring": {
          "0%, 100%": { boxShadow: "4px 4px 0 0 #101010" },
          "50%": { boxShadow: "7px 7px 0 0 #101010" },
        },
        flash: {
          "0%, 100%": { outline: "0 solid transparent", outlineOffset: "3px" },
          "25%, 65%": { outline: "4px solid #FFD60A", outlineOffset: "3px" },
        },
      },
      animation: {
        "pop-in": "pop-in 150ms ease-out both",
        wiggle: "wiggle 300ms ease-in-out",
        hop: "hop 900ms ease-in-out infinite",
        blockblink: "blockblink 1.1s ease-in-out infinite",
        "stamp-in": "stamp-in 380ms cubic-bezier(0.2, 1.8, 0.4, 1) both",
        "card-out": "card-out 420ms ease-in 650ms both",
        marquee: "marquee 22s linear infinite",
        "pulse-ring": "pulse-ring 1.6s ease-in-out infinite",
        flash: "flash 1.4s ease-out 1",
      },
    },
  },
  plugins: [],
};

export default config;
