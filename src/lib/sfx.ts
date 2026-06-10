"use client";

/**
 * Sound stings for payoff moments — tiny synthesized chiptune WAVs in
 * /public/sfx, played through Howler. Client-only; Howls are created
 * lazily on first play so SSR never touches audio. Howler's autoUnlock
 * handles the browser "no audio before a gesture" rule (every sting here
 * fires from a click handler anyway).
 *
 * A global mute lives in localStorage — see SfxToggle in the user menu.
 */

import type { Howl as HowlType } from "howler";

export type SfxName = "win" | "fanfare" | "lose" | "blip" | "chirp";

const MUTE_KEY = "udm.sfx.muted";
const VOLUME: Record<SfxName, number> = {
  win: 0.4,
  fanfare: 0.4,
  lose: 0.35,
  blip: 0.3,
  chirp: 0.35,
};

const howls = new Map<SfxName, HowlType>();

export function sfxMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setSfxMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function playSfx(name: SfxName): void {
  if (typeof window === "undefined" || sfxMuted()) return;
  const cached = howls.get(name);
  if (cached) {
    cached.play();
    return;
  }
  // Lazy import keeps howler out of the SSR bundle path.
  void import("howler").then(({ Howl }) => {
    if (howls.has(name)) {
      howls.get(name)!.play();
      return;
    }
    const howl = new Howl({ src: [`/sfx/${name}.wav`], volume: VOLUME[name] });
    howls.set(name, howl);
    howl.play();
  });
}
