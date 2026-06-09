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
      },
      animation: {
        "pop-in": "pop-in 150ms ease-out both",
        wiggle: "wiggle 300ms ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
