"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { PixelIcon, type IconName } from "@/components/icons";

/**
 * The tab hero kit: each module gets a loud, patterned banner under its
 * header that spotlights the most engageable thing happening right now
 * — a verdict that's due, a ballot you haven't cast, a countdown.
 * Patterns + accents keep each tab visually distinct.
 *
 * Heroes are ACTIONABLE: pass `jumpTo` (a card's DOM id) and the whole
 * banner becomes a button that smooth-scrolls to that card and flashes
 * it, so the spotlight is a doorway into engaging, not just a display.
 */
type Pattern = "stripes" | "dots" | "checker" | "rays";

const PATTERN_STYLES: Record<Pattern, CSSProperties> = {
  stripes: {
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(16,16,16,0.07) 0 14px, transparent 14px 28px)",
  },
  dots: {
    backgroundImage: "radial-gradient(rgba(16,16,16,0.14) 2px, transparent 2.5px)",
    backgroundSize: "18px 18px",
  },
  checker: {
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(16,16,16,0.05) 0 16px, transparent 16px 32px), repeating-linear-gradient(90deg, rgba(16,16,16,0.05) 0 16px, transparent 16px 32px)",
  },
  rays: {
    backgroundImage:
      "repeating-conic-gradient(rgba(16,16,16,0.06) 0deg 8deg, transparent 8deg 24deg)",
  },
};

/** Scroll to a card by id and flash it — the shared "jump from hero" move. */
export function jumpToCard(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("animate-flash");
  // reflow so re-adding the class restarts the animation
  void el.offsetWidth;
  el.classList.add("animate-flash");
  window.setTimeout(() => el.classList.remove("animate-flash"), 1500);
}

export function HeroBanner({
  accentBg,
  pattern = "stripes",
  kicker,
  kickerIcon,
  pulse = false,
  jumpTo,
  jumpLabel = "Take me there ↓",
  className = "",
  children,
}: {
  accentBg: string;
  pattern?: Pattern;
  /** Tiny mono label at the top, e.g. "VERDICT TIME". */
  kicker?: string;
  kickerIcon?: IconName;
  /** Pulsing shadow for things that genuinely demand attention. */
  pulse?: boolean;
  /** DOM id of the card to scroll-and-flash when the banner is clicked. */
  jumpTo?: string;
  /** Action verb shown on the jump affordance, e.g. "Cast your vote ↓". */
  jumpLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const clickable = !!jumpTo;
  return (
    <section
      onClick={clickable ? () => jumpToCard(jumpTo!) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jumpToCard(jumpTo!);
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={`group relative overflow-hidden border-3 border-ink p-5 shadow-brutal ${
        pulse ? "animate-pulse-ring" : ""
      } ${clickable ? "cursor-pointer transition-transform hover:-translate-y-1 focus:outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-accent-yellow" : ""} ${accentBg} ${className}`}
      style={PATTERN_STYLES[pattern]}
    >
      {kicker && (
        <p className="mb-2 inline-flex items-center gap-1.5 border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-white">
          {kickerIcon && <PixelIcon name={kickerIcon} size={12} />}
          {kicker}
        </p>
      )}
      {children}
      {clickable && (
        <span className="mt-4 inline-flex items-center gap-2 border-3 border-ink bg-ink px-4 py-2 font-display font-bold uppercase tracking-wide text-white shadow-brutal transition-transform group-hover:-translate-y-0.5">
          {jumpLabel}
        </span>
      )}
    </section>
  );
}

/** Big chunky CTA used inside heroes. */
export function HeroCta({
  href,
  children,
  className = "bg-ink text-white",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`brutal-press inline-flex items-center gap-2 border-3 border-ink px-4 py-2 font-display font-bold uppercase tracking-wide no-underline shadow-brutal ${className}`}
    >
      {children}
    </Link>
  );
}

/** Infinite scrolling ticker — content is duplicated for the loop. */
export function Marquee({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden whitespace-nowrap">
      <div className="inline-flex w-max animate-marquee items-center gap-10 pr-10">
        <span className="inline-flex items-center gap-10">{children}</span>
        <span className="inline-flex items-center gap-10" aria-hidden>
          {children}
        </span>
      </div>
    </div>
  );
}
