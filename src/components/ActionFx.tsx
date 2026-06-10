"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Card action feedback: a brutalist rubber stamp slams onto the card
 * ("RIGHT ✓", "CLAIMED", …), then — when the action moves the card to
 * a history view — the card animates out before the refresh relocates
 * it. Use from any card component:
 *
 *   const { stamp, fire, cardFxClass } = useActionStamp();
 *   ...on success: fire("RIGHT ✓", "green", { leave: true });
 *   <li className={`brutal-card relative ${cardFxClass}`}>
 *     <StampOverlay stamp={stamp} />
 */
export type StampTone = "green" | "red" | "yellow" | "ink";

const TONE_CLASSES: Record<StampTone, string> = {
  green: "bg-accent-green text-ink",
  red: "bg-accent-red text-white",
  yellow: "bg-accent-yellow text-ink",
  ink: "bg-ink text-white",
};

type Stamp = { text: string; tone: StampTone; leave: boolean };

export function useActionStamp() {
  const router = useRouter();
  const [stamp, setStamp] = useState<Stamp | null>(null);

  /**
   * Show the stamp, then refresh the server data. `leave: true` also
   * plays the card-out animation — for actions that move the card
   * elsewhere (resolved → The Record, finished → graveyard…).
   */
  function fire(text: string, tone: StampTone = "green", opts?: { leave?: boolean }) {
    setStamp({ text, tone, leave: opts?.leave ?? false });
    setTimeout(() => {
      router.refresh();
      setStamp(null);
    }, 1150);
  }

  return {
    stamp,
    fire,
    cardFxClass: stamp?.leave ? "animate-card-out" : "",
  };
}

export function StampOverlay({ stamp }: { stamp: Stamp | null }) {
  if (!stamp) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <span
        className={`animate-stamp-in border-4 border-ink px-5 py-2 font-display text-2xl font-bold uppercase tracking-wider shadow-brutal-lg ${TONE_CLASSES[stamp.tone]}`}
      >
        {stamp.text}
      </span>
    </div>
  );
}
