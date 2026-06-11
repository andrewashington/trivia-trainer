"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sfx";

/** The household coin, drawn once and reused at any size. */
export function CoinGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="8" fill="#FFD60A" stroke="#101010" strokeWidth="2" />
      <circle cx="9" cy="9" r="5" fill="none" stroke="#101010" strokeWidth="1.5" />
      <path
        d="M9 5.5v7M7 7h3.2a1.4 1.4 0 0 1 0 2.8H7.8a1.4 1.4 0 0 0 0 2.8H11"
        fill="none"
        stroke="#101010"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Tier = "normal" | "big" | "huge";
type Particle = { id: number; bx: number; by: number; br: number; bs: number; size: number; delay: number };
type Gain = { amount: number; key: number; tier: Tier; particles: Particle[] };

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function tierFor(amount: number): Tier {
  if (amount >= 100) return "huge";
  if (amount >= 30) return "big";
  return "normal";
}

// Bigger awards spray more coins. Each sprays mostly upward in a fan.
function burstFor(amount: number): Particle[] {
  if (reducedMotion()) return [];
  const count = Math.max(6, Math.min(22, Math.round(amount / 4) + 6));
  return Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (Math.random() - 0.5) * 200) * (Math.PI / 180);
    const dist = 26 + Math.random() * 44;
    return {
      id: i,
      bx: Math.cos(angle) * dist,
      by: Math.sin(angle) * dist,
      br: (Math.random() - 0.5) * 540,
      bs: 0.6 + Math.random() * 0.7,
      size: 8 + Math.round(Math.random() * 6),
      delay: Math.round(Math.random() * 90),
    };
  });
}

/**
 * Gold coin counter in the header — and the door to the wallet. The
 * balance odometer-rolls and, when coins land, the coin flips, a shockwave
 * ring punches out, little coins spray upward, and a floating "+N" chip
 * rises. Big wins get a louder spray and a sound sting. It refreshes when
 * the api() client signals a mutation ("coins:refresh"), on focus, and on
 * tab-visibility — no polling loop.
 */
export function CoinBadge({ initialCoins }: { initialCoins: number }) {
  const [shown, setShown] = useState(initialCoins); // what the odometer displays
  const [gain, setGain] = useState<Gain | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const actual = useRef(initialCoins); // last confirmed server balance
  const raf = useRef<number>(0);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tween the displayed number toward a new balance.
  const rollTo = useCallback((target: number) => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const from = actual.current;
    const dur = Math.min(900, 250 + Math.abs(target - from) * 12);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/coins");
      if (!res.ok) return;
      const { coins } = (await res.json()) as { coins: number };
      if (coins > actual.current) {
        const amount = coins - actual.current;
        const tier = tierFor(amount);
        setGain({ amount, key: Date.now(), tier, particles: burstFor(amount) });
        setCelebrating(true);
        if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrating(false), tier === "normal" ? 700 : 1100);
        if (tier === "huge") playSfx("fanfare");
        else if (tier === "big") playSfx("chirp");
        rollTo(coins);
      } else if (coins !== actual.current) {
        setShown(coins);
      }
      actual.current = coins;
    } catch {
      // offline / signed out — keep the last known balance
    }
  }, [rollTo]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("coins:refresh", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("coins:refresh", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(raf.current);
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    };
  }, [refresh]);

  const chipClass =
    gain?.tier === "huge"
      ? "bg-accent-red text-white"
      : gain?.tier === "big"
        ? "bg-accent-yellow text-ink"
        : "bg-paper text-ink";

  return (
    <Link
      href="/wallet"
      aria-label={`Wallet — ${shown} coins`}
      title="Open your wallet"
      className={`brutal-press relative flex select-none items-center gap-1.5 border-3 border-ink bg-accent-yellow px-2.5 py-1.5 font-display text-sm font-bold text-ink no-underline shadow-brutal ${
        celebrating && gain?.tier === "huge" ? "animate-flash" : ""
      }`}
    >
      {/* Shockwave ring punching out behind the badge on each award. */}
      {celebrating && gain && (
        <span
          key={`ring-${gain.key}`}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-8 w-8 rounded-full border-3 border-ink animate-coin-ring"
        />
      )}

      <span className={`inline-block ${celebrating ? "animate-coin-flip" : ""}`} aria-hidden>
        <CoinGlyph size={18} />
      </span>
      <span className="tabular-nums" aria-hidden>
        {shown.toLocaleString()}
      </span>

      {/* Coins spraying upward — scales with the size of the award. */}
      {gain?.particles.map((p) => (
        <span
          key={`${gain.key}-${p.id}`}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 animate-coin-burst"
          style={
            {
              "--bx": `${p.bx}px`,
              "--by": `${p.by}px`,
              "--br": `${p.br}deg`,
              "--bs": `${p.bs}`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        >
          <CoinGlyph size={p.size} />
        </span>
      ))}

      {gain && (
        <span
          key={gain.key}
          className={`pointer-events-none absolute -top-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap border-2 border-ink px-1.5 py-0.5 font-display text-xs font-bold animate-coin-rise ${chipClass}`}
          onAnimationEnd={() => setGain(null)}
        >
          +{gain.amount.toLocaleString()}
        </span>
      )}
    </Link>
  );
}
