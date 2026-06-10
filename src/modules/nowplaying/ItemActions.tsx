"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { StampOverlay, useActionStamp } from "@/components/ActionFx";

export function ItemActions({ itemId, title }: { itemId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [hovered, setHovered] = useState(0);
  const { stamp, fire, cardFxClass } = useActionStamp();

  async function finish(rating: number | null) {
    setBusy(true);
    try {
      await api(`/api/nowplaying/${itemId}`, {
        method: "PATCH",
        body: { status: "finished", rating },
      });
      setRateOpen(false);
      fire(rating ? `FINISHED ${"★".repeat(rating)}` : "FINISHED", "green", { leave: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/nowplaying/${itemId}`, { method: "DELETE" });
      fire("REMOVED", "red", { leave: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <>
      <StampOverlay stamp={stamp} />
      <span className="flex shrink-0 gap-1.5">
        <button
          onClick={() => setRateOpen(true)}
          disabled={busy}
          title="Mark finished"
          className="brutal-press border-2 border-ink bg-accent-green px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
        >
          ✓ Done
        </button>
        <button
          onClick={remove}
          disabled={busy}
          title="Remove"
          className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
        >
          ✕
        </button>
      </span>

      {/* Finishing prompts for a verdict before it heads to the graveyard. */}
      {rateOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-ink/50 p-4">
          <div className="brutal-card w-full max-w-sm p-6">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink/50">
              Finished!
            </p>
            <h2 className="mt-1 font-display text-xl font-bold leading-snug">
              How was {title}?
            </h2>
            <div className="mt-4 flex justify-center gap-1.5" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  disabled={busy}
                  onMouseEnter={() => setHovered(n)}
                  onClick={() => finish(n)}
                  title={`${n} star${n === 1 ? "" : "s"}`}
                  className={`brutal-press flex h-12 w-12 items-center justify-center border-2 border-ink shadow-brutal-sm ${
                    hovered >= n ? "bg-accent-yellow" : "bg-paper"
                  }`}
                >
                  <PixelIcon name="star" size={26} />
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => finish(null)}
                disabled={busy}
                className="font-mono text-xs font-bold uppercase tracking-wide text-ink/50 hover:text-ink"
              >
                Skip rating
              </button>
              <Button variant="ghost" onClick={() => setRateOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
