"use client";

/**
 * WorldClient — client component that dynamically imports WorldGame
 * with ssr:false (App Router requires that to live in a client
 * component), and hosts the React UI layer the Phaser scene opens via
 * worldBridge (shop modal etc.).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { worldBridge } from "@/modules/world/bridge";
import { ShopModal } from "@/modules/world/ShopModal";

const WorldGame = dynamic(
  () => import("@/modules/world/WorldGame").then((m) => m.WorldGame),
  { ssr: false, loading: () => <div className="h-80 animate-pulse bg-card border-3 border-ink" /> }
);

export function WorldClient({ characterPath }: { characterPath: string }) {
  const [panel, setPanel] = useState<"shop" | null>(null);

  useEffect(
    () => worldBridge.on("open-panel", ({ panel }) => setPanel(panel)),
    []
  );

  const close = useCallback(() => {
    setPanel(null);
    worldBridge.emit("panel-closed", undefined);
  }, []);

  return (
    <>
      <WorldGame characterPath={characterPath} />
      {panel === "shop" && <ShopModal onClose={close} />}
    </>
  );
}
