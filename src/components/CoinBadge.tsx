"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Gold coin counter in the header. The balance odometer-rolls and the coin
 * does a flip with a floating "+N" chip whenever coins land. It refreshes
 * when the api() client signals a mutation ("coins:refresh"), on focus,
 * and when the tab becomes visible — no polling loop.
 */
export function CoinBadge({ initialCoins }: { initialCoins: number }) {
  const [shown, setShown] = useState(initialCoins); // what the odometer displays
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const actual = useRef(initialCoins); // last confirmed server balance
  const raf = useRef<number>(0);

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
        setGain({ amount: coins - actual.current, key: Date.now() });
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 700);
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
    };
  }, [refresh]);

  return (
    <div
      className="relative flex select-none items-center gap-1.5 border-3 border-ink bg-accent-yellow px-2.5 py-1.5 font-display text-sm font-bold shadow-brutal"
      title="Coins — earned by playing games, setting records, and posting"
    >
      <span
        className={`inline-block ${celebrating ? "animate-coin-flip" : ""}`}
        aria-hidden
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="8" fill="#FFD60A" stroke="#101010" strokeWidth="2" />
          <circle cx="9" cy="9" r="5" fill="none" stroke="#101010" strokeWidth="1.5" />
          <path d="M9 5.5v7M7 7h3.2a1.4 1.4 0 0 1 0 2.8H7.8a1.4 1.4 0 0 0 0 2.8H11" fill="none" stroke="#101010" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className="tabular-nums" aria-label={`${shown} coins`}>
        {shown.toLocaleString()}
      </span>

      {gain && (
        <span
          key={gain.key}
          className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 animate-coin-rise whitespace-nowrap border-2 border-ink bg-paper px-1.5 py-0.5 font-display text-xs font-bold text-ink"
          onAnimationEnd={() => setGain(null)}
        >
          +{gain.amount}
        </span>
      )}
    </div>
  );
}
