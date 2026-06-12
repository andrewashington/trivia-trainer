"use client";

/**
 * WorldClient — client component that dynamically imports WorldGame
 * with ssr:false (App Router requires that to live in a client
 * component), and hosts the React UI layer the Phaser scene opens via
 * worldBridge (shop modal, house sales, etc.).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { worldBridge } from "@/modules/world/bridge";
import { ShopModal } from "@/modules/world/ShopModal";
import { HouseSaleModal } from "@/modules/world/HouseSaleModal";
import { ArcadeOverlay } from "@/modules/world/ArcadeOverlay";

const WorldGame = dynamic(
  () => import("@/modules/world/WorldGame").then((m) => m.WorldGame),
  { ssr: false, loading: () => <div className="h-80 animate-pulse bg-card border-3 border-ink" /> }
);

type HouseState = {
  price: number;
  coins: number;
  myPlot: number | null;
  plots: { plot: number; owner: { id: string; name: string } | null }[];
};

export function WorldClient({ characterPath }: { characterPath: string }) {
  const [panel, setPanel] = useState<"shop" | "arcade" | null>(null);
  const [sale, setSale] = useState<{ plot: number; price: number; coins: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setPanel(null);
    setSale(null);
    worldBridge.emit("panel-closed", undefined);
  }, []);

  const showBanner = useCallback((text: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(text);
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  }, []);

  useEffect(
    () => worldBridge.on("open-panel", ({ panel }) => setPanel(panel)),
    []
  );

  // Plot doors: the scene freezes input and asks React what's behind the
  // door. Owned (by anyone) → walk in; unowned → the for-sale panel.
  useEffect(
    () =>
      worldBridge.on("plot-door", async ({ plot }) => {
        try {
          const res = await fetch("/api/world/house");
          if (!res.ok) throw new Error();
          const data = (await res.json()) as HouseState;
          const entry = data.plots.find((p) => p.plot === plot);
          if (entry?.owner) {
            const mine = data.myPlot === plot;
            worldBridge.emit("enter-house", {
              plot,
              ownerId: entry.owner.id,
              ownerName: entry.owner.name,
              mine,
            });
            showBanner(
              mine ? "🏠 Welcome home." : `🏠 ${entry.owner.name}'s house. They know you're here.`
            );
          } else {
            setSale({ plot, price: data.price, coins: data.coins });
          }
        } catch {
          // Couldn't load the registry — unfreeze the scene and move on.
          worldBridge.emit("panel-closed", undefined);
        }
      }),
    [showBanner]
  );

  const purchased = useCallback(
    (plot: number) => {
      setSale(null);
      worldBridge.emit("enter-house", { plot, ownerId: "", ownerName: "you", mine: true });
      showBanner("🏠 Sold! Try not to ruin the floors on day one.");
    },
    [showBanner]
  );

  return (
    <>
      <WorldGame characterPath={characterPath} />
      {banner && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[1300] -translate-x-1/2 border-3 border-ink bg-accent-yellow px-4 py-2 font-mono text-sm font-bold shadow-brutal">
          {banner}
        </div>
      )}
      {panel === "shop" && <ShopModal onClose={close} />}
      {panel === "arcade" && <ArcadeOverlay onClose={close} />}
      {sale && (
        <HouseSaleModal
          plot={sale.plot}
          price={sale.price}
          coins={sale.coins}
          onClose={close}
          onPurchased={purchased}
        />
      )}
    </>
  );
}
