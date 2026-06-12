"use client";

import { useState } from "react";
import type { ActiveCoinReward } from "@/lib/coinRewards";
import { CoinGlyph } from "@/components/CoinBadge";

type ClaimResponse = {
  ok?: boolean;
  amount?: number;
  coins?: number;
  claimed?: boolean;
  error?: string;
};

export function CoinRewardBanner({ reward }: { reward: ActiveCoinReward }) {
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  async function claim() {
    if (busy || claimed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coin-rewards/current/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as ClaimResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Could not claim coins.");
      }
      setClaimed(true);
      window.dispatchEvent(new Event("coins:refresh"));
      window.setTimeout(() => setVisible(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim coins.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sticky top-2 z-30 mb-4 overflow-hidden border-3 border-ink bg-accent-yellow shadow-brutal">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <div className="relative flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border-3 border-ink bg-card shadow-brutal-sm">
            <CoinGlyph size={24} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-black uppercase leading-tight sm:text-lg">
              {claimed ? `${reward.amount.toLocaleString()} coins claimed` : reward.title}
            </p>
            <p className="mt-1 font-mono text-[11px] font-bold leading-snug text-ink/70">
              {claimed
                ? "Wallet updated. Go cause tiny economic consequences."
                : reward.body}
            </p>
            {error && (
              <p className="mt-1 font-mono text-[11px] font-bold text-accent-red">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          {!claimed && (
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="border-2 border-ink bg-card px-3 py-2 font-mono text-[11px] font-black uppercase shadow-brutal-sm"
            >
              Later
            </button>
          )}
          <button
            type="button"
            onClick={claim}
            disabled={busy || claimed}
            className="brutal-press border-3 border-ink bg-ink px-4 py-2 font-display text-sm font-black uppercase text-white shadow-brutal-sm disabled:cursor-default disabled:bg-accent-meadow disabled:text-ink"
          >
            {claimed ? "Banked" : busy ? "Claiming..." : reward.cta}
          </button>
        </div>
      </div>
    </section>
  );
}
