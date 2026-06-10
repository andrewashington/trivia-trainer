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
          punch: "#FF3366", // countdowns
          ocean: "#0077B6", // trivia

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
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "sheet-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
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
        // Gentle continuous bob — floating logo letters & confetti.
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        // Twinkle for the magic-link sparkles.
        sparkle: {
          "0%, 100%": { transform: "scale(0.7) rotate(0deg)", opacity: "0.5" },
          "50%": { transform: "scale(1.15) rotate(20deg)", opacity: "1" },
        },
        // Light sweep across the CTA.
        sheen: {
          "0%": { transform: "translateX(-160%) skewX(-20deg)" },
          "100%": { transform: "translateX(360%) skewX(-20deg)" },
        },
        // Big bouncy entrance that settles neutral (keeps child tilt intact).
        "drop-in": {
          "0%": { transform: "scale(1.8) translateY(-48px)", opacity: "0" },
          "60%": { transform: "scale(0.94) translateY(0)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        // ----- The Pet creature: one idle loop per mood -----
        // Calm rise-and-fall, like breathing (the "okay" mood).
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
        // Loose happy sway.
        sway: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        // Slow sleepy bob.
        snooze: {
          "0%, 100%": { transform: "translateY(0) rotate(-1deg)" },
          "50%": { transform: "translateY(-2px) rotate(1deg)" },
        },
        // Periodic eye blink (scaleY squash, step-held open most of the cycle).
        blink: {
          "0%, 90%, 100%": { transform: "scaleY(1)" },
          "95%": { transform: "scaleY(0.08)" },
        },
        // Pat reaction: squash-and-stretch pop.
        squish: {
          "0%": { transform: "scale(1)" },
          "25%": { transform: "scale(1.18, 0.82)" },
          "55%": { transform: "scale(0.92, 1.1)" },
          "100%": { transform: "scale(1)" },
        },
        // Hearts/sparkles puffing up off the pet when patted.
        "pat-burst": {
          "0%": { transform: "translateY(0) scale(0.5)", opacity: "0" },
          "25%": { opacity: "1" },
          "100%": { transform: "translateY(-46px) scale(1.1)", opacity: "0" },
        },
        // Floating "Z" over a sleeping pet.
        zfloat: {
          "0%": { transform: "translateY(0) scale(0.7)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateY(-18px) scale(1.1)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out both",
        "sheet-up": "sheet-up 220ms cubic-bezier(0.2, 1, 0.35, 1) both",
        "pop-in": "pop-in 150ms ease-out both",
        wiggle: "wiggle 300ms ease-in-out",
        hop: "hop 900ms ease-in-out infinite",
        blockblink: "blockblink 1.1s ease-in-out infinite",
        "stamp-in": "stamp-in 380ms cubic-bezier(0.2, 1.8, 0.4, 1) both",
        "card-out": "card-out 420ms ease-in 650ms both",
        marquee: "marquee 22s linear infinite",
        "pulse-ring": "pulse-ring 1.6s ease-in-out infinite",
        flash: "flash 1.4s ease-out 1",
        float: "float 3.6s ease-in-out infinite",
        sparkle: "sparkle 1.3s ease-in-out infinite",
        sheen: "sheen 2.8s ease-in-out infinite",
        "drop-in": "drop-in 520ms cubic-bezier(0.2, 1.5, 0.4, 1) both",
        breathe: "breathe 2.8s ease-in-out infinite",
        sway: "sway 3.4s ease-in-out infinite",
        snooze: "snooze 3s ease-in-out infinite",
        blink: "blink 4.5s step-end infinite",
        squish: "squish 560ms cubic-bezier(0.3, 1.6, 0.5, 1) both",
        "pat-burst": "pat-burst 800ms ease-out forwards",
        zfloat: "zfloat 2.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
