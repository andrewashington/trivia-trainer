import type { ReactNode } from "react";

/**
 * Renders a key string as color-coded segments so chart-holders can
 * parse it at a glance — `l7c6h2…` becomes a row of tiny tiles, one
 * hue per trait. The underlying string never changes; this is purely
 * presentation (copying still yields the compact code).
 */

const SEGMENT_COLORS: Record<string, string> = {
  l: "bg-accent-yellow text-ink",
  c: "bg-accent-orange text-ink",
  h: "bg-accent-pink text-ink",
  s: "bg-accent-cyan text-ink",
  f: "bg-accent-green text-ink",
  g: "bg-accent-lime text-ink",
  v: "bg-accent-red text-white",
  d: "bg-accent-sky text-ink",
  w: "bg-accent-teal text-ink",
  b: "bg-accent-magenta text-white",
};

export const KEY_LEGEND: [string, string][] = [
  ["l", "length"],
  ["c", "circumference"],
  ["h", "head"],
  ["s", "shaft"],
  ["f", "foreskin"],
  ["g", "grooming"],
  ["v", "veins"],
  ["d", "direction"],
  ["w", "which way"],
  ["b", "bend"],
];

export function KeyCodeDisplay({ code }: { code: string }): ReactNode {
  const segments = code.match(/[a-z]+\d+/g) ?? [code];
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5 align-middle">
      {segments.map((seg, i) => {
        const letter = seg.replace(/\d+/g, "");
        return (
          <span
            key={i}
            className={`border border-ink px-1 py-0.5 font-mono text-xs font-bold leading-none ${
              SEGMENT_COLORS[letter] ?? "bg-paper text-ink"
            }`}
          >
            {seg}
          </span>
        );
      })}
    </span>
  );
}

/** The decoder ring, rendered small: `l length · c circumference · …` */
export function KeyLegend({ className }: { className?: string }) {
  return (
    <span className={`font-mono text-[9px] uppercase tracking-wide ${className ?? ""}`}>
      {KEY_LEGEND.map(([letter, label], i) => (
        <span key={letter} className="whitespace-nowrap">
          {i > 0 && " · "}
          <b>{letter}</b> {label}
        </span>
      ))}
    </span>
  );
}
