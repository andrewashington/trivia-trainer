"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Badge } from "@/components/ui";
import { DELIVERY_LABELS, formatPrice } from "@/modules/marketplace/schema";

export type ListingView = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  delivery: string;
  imageUrl: string | null;
  status: "available" | "claimed" | "gone";
  sellerName: string;
  sellerVenmo: string | null;
  claimedByName: string | null;
  isMine: boolean;
  myClaim: boolean;
  isAdmin: boolean;
  tilt: string;
};

export function ListingCard({ listing }: { listing: ListingView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const claim = () => act(() => api(`/api/marketplace/${listing.id}/claim`, { method: "POST" }));
  const unclaim = () => act(() => api(`/api/marketplace/${listing.id}/claim`, { method: "DELETE" }));
  const markGone = () =>
    act(() => api(`/api/marketplace/${listing.id}`, { method: "PATCH", body: { status: "gone" } }));
  const relist = () =>
    act(() => api(`/api/marketplace/${listing.id}`, { method: "PATCH", body: { status: "available" } }));

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    await act(() => api(`/api/marketplace/${listing.id}`, { method: "DELETE" }));
  }

  const gone = listing.status === "gone";

  return (
    <div className={`brutal-card overflow-hidden !p-0 ${listing.tilt} ${gone ? "opacity-60" : ""}`}>
      {listing.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={listing.imageUrl} alt="" className="h-40 w-full border-b-3 border-ink object-cover" />
      ) : (
        <div className="flex h-24 w-full items-center justify-center border-b-3 border-ink bg-accent-yellow text-4xl">
          🏷️
        </div>
      )}

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-lg font-bold leading-tight">{listing.title}</p>
          <Badge
            className={
              listing.priceCents ? "bg-accent-magenta text-white shrink-0" : "bg-accent-green shrink-0"
            }
          >
            {formatPrice(listing.priceCents)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge className="bg-paper">{DELIVERY_LABELS[listing.delivery]}</Badge>
          {listing.status === "claimed" && (
            <Badge className="bg-accent-yellow">
              ✋ Claimed by {listing.myClaim ? "you" : listing.claimedByName}
            </Badge>
          )}
          {gone && <Badge className="bg-ink text-white">GONE</Badge>}
        </div>

        {listing.description && (
          <p className="whitespace-pre-wrap text-sm text-ink/70">{listing.description}</p>
        )}

        <p className="font-mono text-[10px] uppercase text-ink/40">
          {listing.sellerName}
          {listing.sellerVenmo && (
            <>
              {" · "}
              <a
                href={`https://venmo.com/u/${listing.sellerVenmo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-accent-blue"
              >
                @{listing.sellerVenmo} ↗
              </a>
            </>
          )}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {!listing.isMine && listing.status === "available" && (
            <button
              onClick={claim}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-accent-green px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm"
            >
              ✋ Claim it
            </button>
          )}
          {listing.status === "claimed" && (listing.myClaim || listing.isMine || listing.isAdmin) && (
            <button
              onClick={unclaim}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-card px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm"
            >
              {listing.myClaim ? "Never mind" : "Release claim"}
            </button>
          )}
          {(listing.isMine || listing.isAdmin) && !gone && (
            <button
              onClick={markGone}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-card px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm"
            >
              ✓ It&apos;s gone
            </button>
          )}
          {(listing.isMine || listing.isAdmin) && gone && (
            <button
              onClick={relist}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-card px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm"
            >
              ↻ Relist
            </button>
          )}
          {(listing.isMine || listing.isAdmin) && (
            <button
              onClick={remove}
              disabled={busy}
              className={`brutal-press border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm ${
                armed ? "bg-accent-red text-white" : "bg-card"
              }`}
            >
              {armed ? "Sure?" : "✕"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
