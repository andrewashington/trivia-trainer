"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

/**
 * The for-sale panel for an unowned neighborhood plot. WorldClient opens
 * it when the player walks into a door nobody owns (scene emits
 * plot-door, client checks the registry). Buying claims the plot
 * globally and walks the buyer straight inside.
 */

const AGENT_LINES = [
  "Cozy. The walls are load-bearing, which is more than most can say.",
  "Previous owner? Never existed. Legally pristine.",
  "Great bones. We did not check the bones.",
  "The neighborhood is up-and-coming. It has nowhere else to go.",
  "Natural light included at no extra charge. For now.",
];

export function HouseSaleModal({
  plot,
  price,
  coins,
  onClose,
  onPurchased,
}: {
  plot: number;
  price: number;
  coins: number;
  onClose: () => void;
  onPurchased: (plot: number, coins: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [line] = useState(() => AGENT_LINES[Math.floor(Math.random() * AGENT_LINES.length)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/world/house/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plot }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; coins?: number }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "The deal fell through.");
      onPurchased(plot, data!.coins!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The deal fell through.");
      setBusy(false);
    }
  }

  const affordable = coins >= price;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/60 p-4">
      <div className="w-full max-w-md border-3 border-ink bg-card shadow-brutal">
        <div className="flex items-center justify-between border-b-3 border-ink bg-accent-yellow px-4 py-2">
          <div>
            <h2 className="font-display text-lg font-black uppercase tracking-tight">
              Plot #{plot} — For Sale
            </h2>
            <p className="font-mono text-[10px] text-ink/60">&ldquo;{line}&rdquo; — the agent</p>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 p-4">
          {error && <p className="font-bold text-accent-red">{error}</p>}
          <div className="flex items-center justify-between border-2 border-ink p-3">
            <div>
              <p className="text-sm font-black">One (1) entire house</p>
              <p className="font-mono text-[10px] text-ink/50">
                interior included · doors stay unlocked · furniture sold separately
              </p>
            </div>
            <span className="border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-sm font-bold">
              🪙 {price}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-ink/60">your savings: 🪙 {coins}</span>
            <Button
              type="button"
              variant="yellow"
              disabled={busy || !affordable}
              onClick={buy}
            >
              {busy ? "signing the deed…" : affordable ? `buy it · ${price}` : "mortgage denied"}
            </Button>
          </div>
        </div>

        <div className="border-t-3 border-ink px-4 py-1.5">
          <p className="font-mono text-[10px] text-ink/40">
            all sales final · one house per resident · the HOA sees everything
          </p>
        </div>
      </div>
    </div>
  );
}
