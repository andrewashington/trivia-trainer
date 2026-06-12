"use client";

import { cardLabel, isRed } from "./cardLabel";

/** A single rendered card, or a face-down back when `card` is null. */
export function PlayingCard({
  card,
  size = "md",
  dealt = false,
}: {
  card: number | null;
  size?: "sm" | "md";
  dealt?: boolean;
}) {
  const dims =
    size === "sm" ? "h-10 w-7 text-sm" : "h-14 w-10 text-lg";
  if (card === null) {
    return (
      <span
        className={`inline-flex items-center justify-center border-2 border-ink bg-accent-baize ${dims} ${
          dealt ? "poker-deal" : ""
        }`}
      >
        <span className="text-paper/40">★</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex flex-col items-center justify-center border-2 border-ink bg-paper font-display font-bold tabular-nums ${dims} ${
        isRed(card) ? "text-accent-red" : "text-ink"
      } ${dealt ? "poker-deal" : ""}`}
    >
      {cardLabel(card)}
    </span>
  );
}
