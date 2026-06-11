"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader, Card, LinkButton, EmptyState } from "@/components/ui";
import { CoinGlyph } from "@/components/CoinBadge";

type Entry = {
  id: string;
  amount: number;
  reason: string;
  label: string;
  createdAt: string;
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function WalletView({ coins, recent }: { coins: number; recent: Entry[] }) {
  // Count the balance up from zero on open for a little drumroll.
  const [shown, setShown] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const dur = Math.min(1400, 500 + coins * 1.2);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(coins * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [coins]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Wallet" icon="money" accentBg="bg-accent-yellow" />

      {/* The hero balance: a fat spinning coin and a counting-up total. */}
      <Card className="relative overflow-hidden bg-accent-yellow text-center">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute -left-6 -top-6 animate-float">
            <CoinGlyph size={64} />
          </div>
          <div className="absolute -bottom-8 -right-4 animate-float [animation-delay:1.2s]">
            <CoinGlyph size={88} />
          </div>
        </div>
        <div className="relative flex flex-col items-center gap-2 py-4">
          <span className="inline-block animate-coin-flip [animation-iteration-count:1]">
            <CoinGlyph size={72} />
          </span>
          <div className="font-display text-5xl font-bold tabular-nums tracking-tight">
            {shown.toLocaleString()}
          </div>
          <div className="font-display text-sm font-bold uppercase tracking-widest text-ink/70">
            coins in the bank
          </div>
        </div>
      </Card>

      {/* Somewhere to actually blow them. */}
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/blackjack" variant="green">
          Hit the tables
        </LinkButton>
        <LinkButton href="/treasure" variant="yellow">
          Dig for treasure
        </LinkButton>
      </div>

      {/* Recent ledger — earns and spends, newest first. */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide">Recent activity</h2>
        {recent.length === 0 ? (
          <EmptyState
            icon="money"
            title="No coins yet"
            hint="Post stuff, win games, set records — they'll start rolling in."
          />
        ) : (
          <ul className="space-y-2">
            {recent.map((t) => {
              const positive = t.amount >= 0;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 border-3 border-ink bg-card px-3 py-2 shadow-brutal-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold">{t.label}</div>
                    <div className="text-xs text-ink/55">{relTime(t.createdAt)}</div>
                  </div>
                  <span
                    className={`shrink-0 border-2 border-ink px-2 py-0.5 font-mono text-sm font-bold tabular-nums ${
                      positive ? "bg-accent-green text-ink" : "bg-accent-red text-white"
                    }`}
                  >
                    {positive ? "+" : "−"}
                    {Math.abs(t.amount).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The wallet is going to grow — leave a hook for what's next. */}
      <Card className="bg-paper text-center text-sm text-ink/60">
        More wallet features are on the way. For now, watch it grow.
      </Card>
    </div>
  );
}
