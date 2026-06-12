"use client";

import { useEffect, useRef } from "react";

/** Lazy-loaded so the Phaser import only runs on the client. */
export function WorldGame({ characterPath }: { characterPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let game: import("phaser").Game | null = null;

    // Dynamic import keeps Phaser out of the SSR bundle.
    (async () => {
      const Phaser = (await import("phaser")).default;
      const { WorldScene } = await import("./WorldScene");

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: "100%",
        height: "100%",
        pixelArt: true,
        roundPixels: true,
        backgroundColor: "#1a1a1a",
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
          default: "arcade",
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
      });
      game.scene.add("WorldScene", WorldScene, true, { characterPath });
    })();

    return () => {
      game?.destroy(true);
    };
  }, [characterPath]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "calc(100vh - 160px)", minHeight: 320 }}
      className="overflow-hidden border-3 border-ink shadow-brutal"
    />
  );
}
