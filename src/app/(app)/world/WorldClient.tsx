"use client";

/**
 * WorldClient — client component that dynamically imports WorldGame
 * with ssr:false. App Router requires ssr:false dynamic imports to live
 * in a client component (not a server component).
 */

import dynamic from "next/dynamic";

const WorldGame = dynamic(
  () => import("@/modules/world/WorldGame").then((m) => m.WorldGame),
  { ssr: false, loading: () => <div className="h-80 animate-pulse bg-card border-3 border-ink" /> }
);

export function WorldClient({ characterPath }: { characterPath: string }) {
  return <WorldGame characterPath={characterPath} />;
}
