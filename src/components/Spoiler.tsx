"use client";

import { useState, type ReactNode } from "react";
import { PixelIcon } from "@/components/icons";

interface SpoilerProps {
  children: ReactNode;
  label?: string;
  interactive?: boolean;
  className?: string;
}

/**
 * Blur-until-revealed wrapper. State is local — re-blurs on every mount
 * (i.e. every page load). No persistence.
 *
 * interactive=true (default): a div with role=button that reveals on
 * click. A div (not a <button>) so it can legally wrap content that
 * itself contains buttons or block elements (e.g. a file preview with a
 * download button). Use for standalone content NOT already inside an
 * <a>/<button>.
 *
 * interactive=false: an inline <span> with blur only, no reveal control.
 * Use when the spoiler sits inside an existing <a>/<Link> or <button>
 * (must stay phrasing content) — the parent's click navigates the viewer
 * somewhere they can reveal.
 */
export function Spoiler({
  children,
  label = "Sensitive — tap to reveal",
  interactive = true,
  className,
}: SpoilerProps) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return <>{children}</>;
  }

  if (interactive === false) {
    // Phrasing-only, no reveal control — safe inside a parent <a>/<button>.
    return (
      <span className={`pointer-events-none select-none blur-lg align-middle${className ? ` ${className}` : ""}`}>
        {children}
      </span>
    );
  }

  // Default: reveal-on-click, as a div with role=button (see doc above).
  const reveal = () => setRevealed(true);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        reveal();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          reveal();
        }
      }}
      className={`relative block h-full w-full cursor-pointer${className ? ` ${className}` : ""}`}
    >
      {/* Blurred content — hidden from AT since the overlay describes it */}
      <div aria-hidden className="pointer-events-none select-none blur-xl">
        {children}
      </div>
      {/* Overlay chip */}
      <span className="absolute inset-0 grid place-items-center">
        <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-card/90 px-2 py-1 font-display text-xs font-bold uppercase shadow-brutal-sm">
          <PixelIcon name="eye-off" size={13} className="shrink-0" />
          {label}
        </span>
      </span>
    </div>
  );
}
