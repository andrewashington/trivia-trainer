"use client";

import { useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sfx";

/**
 * The Dick Key. UDM+'s most-voted planned idea (thanks, Puddlelift).
 *
 * A floating keyboard key pinned bottom-right. Press it and:
 *  - if a text field was focused, an ASCII dick is typed at the cursor
 *    (length varies — it's random, don't read into it);
 *  - otherwise one is copied to your clipboard with a toast, and a
 *    confetti volley of dicks rains from the top of the screen.
 *
 * A lifetime press count lives in localStorage and shows on hover.
 * That's it. That's the feature.
 */

const COUNT_KEY = "udm-dick-key-presses";

/** Forge a fresh dick. Shaft length 3–8; ~1-in-12 are extra blessed. */
function forge(): string {
  const blessed = Math.random() < 1 / 12;
  const shaft = blessed ? 14 : 3 + Math.floor(Math.random() * 6);
  return `8${"=".repeat(shaft)}D${blessed ? "~" : ""}`;
}

function canParty(): boolean {
  return (
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Rain dicks. canvas-confetti can use text as a particle shape. */
async function dickfetti(): Promise<void> {
  if (!canParty()) return;
  const confetti = (await import("canvas-confetti")).default;
  const shape = confetti.shapeFromText({ text: "8=D", scalar: 3 });
  const end = Date.now() + 900;
  const volley = () => {
    void confetti({
      particleCount: 5,
      spread: 100,
      startVelocity: 18,
      gravity: 0.8,
      scalar: 3,
      shapes: [shape],
      flat: true,
      origin: { x: 0.1 + Math.random() * 0.8, y: 0 },
      disableForReducedMotion: true,
    });
    if (Date.now() < end) setTimeout(volley, 150);
  };
  volley();
}

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return ["text", "search", "url", "tel", "email"].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

export function DickKey() {
  const [presses, setPresses] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPresses(Number(localStorage.getItem(COUNT_KEY)) || 0);
    // Remember the last text field the user was in, so the key still
    // works even though clicking it steals focus.
    const onFocus = (e: FocusEvent) => {
      if (isEditable(e.target as Element)) {
        lastFocused.current = e.target as HTMLElement;
      }
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  async function press() {
    playSfx("blip");
    const d = forge();
    const next = presses + 1;
    setPresses(next);
    try {
      localStorage.setItem(COUNT_KEY, String(next));
    } catch {
      /* private mode — the count was never that important */
    }

    const target = lastFocused.current;
    if (target && document.contains(target)) {
      // Type it where the user was typing. execCommand still fires the
      // input events React listens for, so controlled inputs keep up.
      target.focus();
      const typed = document.execCommand("insertText", false, d);
      if (typed) {
        showToast("Deployed.");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(d);
      showToast(`${d} copied. Use it wisely.`);
    } catch {
      showToast(d);
    }
    void dickfetti();
  }

  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-label="The dick key"
        title={
          presses === 0
            ? "The dick key. You know what to do."
            : `The dick key — pressed ${presses} time${presses === 1 ? "" : "s"}. No regrets.`
        }
        className="brutal-press fixed bottom-20 right-4 z-[1000] flex h-10 w-10 items-center justify-center border-3 border-ink bg-card font-display text-lg font-bold shadow-brutal md:bottom-6 md:right-6"
      >
        D
      </button>
      {toast && (
        <div
          role="status"
          className="fixed bottom-32 right-4 z-[1000] max-w-[16rem] border-3 border-ink bg-accent-yellow px-3 py-2 font-display text-sm font-bold shadow-brutal md:bottom-[4.5rem] md:right-6"
        >
          {toast}
        </div>
      )}
    </>
  );
}
