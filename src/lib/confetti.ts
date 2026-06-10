"use client";

/**
 * Shared confetti presets, tinted with the module accent palette
 * (tailwind.config.ts). Client-only: canvas-confetti is loaded lazily so
 * nothing touches the DOM during SSR, and every preset is a no-op when
 * the user prefers reduced motion. Each preset also fires its sound
 * sting (lib/sfx) — sound has its own mute, separate from motion.
 */

import { playSfx } from "@/lib/sfx";

const ACCENTS = [
  "#2563FF", // blue
  "#FF4D2E", // red
  "#FFD60A", // yellow
  "#3DDC4E", // green
  "#9B5DE5", // grape
  "#FF6FB5", // pink
  "#E0218A", // magenta
  "#00CFE8", // cyan
];

function canParty(): boolean {
  return (
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

async function fire(opts: object): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  confetti({ colors: ACCENTS, disableForReducedMotion: true, ...opts });
}

/** Quick centered pop — for one-shot wins (a claim resolved, a listing claimed). */
export function confettiBurst(): void {
  playSfx("win");
  if (!canParty()) return;
  void fire({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.65 } });
}

/** Side cannons over ~1.5s — the big celebration (records, settled bets, unmasks). */
export function confettiCelebrate(): void {
  playSfx("fanfare");
  if (!canParty()) return;
  const end = Date.now() + 1500;
  const volley = () => {
    void fire({ particleCount: 26, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    void fire({ particleCount: 26, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
    if (Date.now() < end) setTimeout(volley, 220);
  };
  volley();
}

/** A subtle drift from the top — a wink, not a parade. */
export function confettiSprinkle(): void {
  playSfx("blip");
  if (!canParty()) return;
  void fire({
    particleCount: 40,
    spread: 120,
    startVelocity: 14,
    gravity: 0.7,
    scalar: 0.8,
    origin: { y: 0.1 },
  });
}
