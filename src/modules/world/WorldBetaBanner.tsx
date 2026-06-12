"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Home-page launch banner for The World beta. Dismissable (persisted
 * via introsSeen key "world-banner"); the nav glow keeps inviting
 * separately until the beta terms are accepted.
 */
export function WorldBetaBanner() {
  const [gone, setGone] = useState(false);
  if (gone) return null;

  function dismiss() {
    setGone(true);
    fetch("/api/me/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "intro-seen", module: "world-banner" }),
    }).catch(() => {});
  }

  return (
    <div className="relative overflow-hidden border-3 border-ink bg-accent-meadow shadow-brutal">
      {/* sheen sweep */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 pr-10 sm:p-4 sm:pr-12">
        <span className="animate-float text-3xl">🌍</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-black uppercase leading-tight tracking-tight sm:text-xl">
            The World is open{" "}
            <span className="inline-block -rotate-2 border-2 border-ink bg-ink px-1.5 font-mono text-xs not-italic text-white">
              BETA
            </span>
          </p>
          <p className="font-mono text-[11px] text-ink/70">
            a tiny walkable town · your own avatar · a shop that wants your coins
          </p>
        </div>
        <Link
          href="/world"
          className="brutal-press animate-pulse-ring border-3 border-ink bg-accent-yellow px-4 py-2 font-display text-sm font-black uppercase tracking-wide no-underline"
        >
          Enter →
        </Link>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 border-2 border-ink bg-card px-1.5 font-mono text-xs font-bold"
      >
        ✕
      </button>
    </div>
  );
}
