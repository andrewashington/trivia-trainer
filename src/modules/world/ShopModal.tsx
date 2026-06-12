"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import type { AvatarConfig } from "./avatar";
import { partPaths } from "./avatar";
import { worldBridge } from "./bridge";

/**
 * The market's outfit shop, opened by talking to the shopkeep (the
 * scene emits open-panel via worldBridge; WorldClient renders this over
 * the canvas). Previews are "dressing room" composites: the player's
 * own body/eyes/hair under each catalog outfit, animated exactly like
 * the creator (stacked background-image part sheets).
 */

const ASSET_BASE = "/api/world/assets";
const FRAME_W = 16;
const FRAME_H = 32;
const SCALE = 4;

type CatalogEntry = {
  style: string;
  name: string;
  price: number;
  colors: string[];
  owned: boolean;
};

type ShopState = {
  coins: number;
  config: AvatarConfig | null;
  equipped: { style: string; color: string } | null;
  shopLines: string[];
  catalog: CatalogEntry[];
};

/** Animated try-on preview: the buyer's own parts wearing `outfit`. */
function TryOnPreview({
  config,
  outfit,
  frameCol,
}: {
  config: AvatarConfig;
  outfit: { style: string; color: string };
  frameCol: number;
}) {
  const layers = partPaths({ ...config, outfit });
  // idle cycle, facing down: row 1, cols 18–23
  const bgX = -(18 + frameCol) * FRAME_W * SCALE;
  const bgY = -1 * FRAME_H * SCALE;
  return (
    <div
      className="border-2 border-ink bg-accent-green/20"
      style={{ width: FRAME_W * SCALE, height: FRAME_H * SCALE, position: "relative", overflow: "hidden" }}
    >
      {layers.map((p) => (
        <div
          key={p}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${ASSET_BASE}/${p})`,
            backgroundPosition: `${bgX}px ${bgY}px`,
            backgroundSize: `${56 * FRAME_W * SCALE}px auto`,
            backgroundRepeat: "no-repeat",
            imageRendering: "pixelated",
          }}
        />
      ))}
    </div>
  );
}

export function ShopModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<ShopState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // style being bought/equipped
  const [colorIdx, setColorIdx] = useState<Record<string, number>>({});
  const [frameCol, setFrameCol] = useState(0);
  // dialog comes from the shop payload (admin-editable in /world/admin)
  const line = useMemo(() => {
    const lines = state?.shopLines ?? [];
    return lines.length ? lines[Math.floor(Math.random() * lines.length)] : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.shopLines]);

  useEffect(() => {
    fetch("/api/world/shop")
      .then((r) => {
        if (!r.ok) throw new Error("The shop is closed (couldn't load it).");
        return r.json();
      })
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);

  // shared idle animation clock for all previews
  useEffect(() => {
    const t = setInterval(() => setFrameCol((f) => (f + 1) % 6), 165);
    return () => clearInterval(t);
  }, []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const colorOf = useCallback(
    (entry: CatalogEntry) => entry.colors[(colorIdx[entry.style] ?? 0) % entry.colors.length],
    [colorIdx]
  );

  async function purchase(entry: CatalogEntry) {
    setBusy(entry.style);
    setError(null);
    try {
      const res = await fetch("/api/world/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "outfit", itemKey: entry.style }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; coins?: number } | null;
      if (!res.ok) throw new Error(data?.error ?? "Purchase failed.");
      setState((s) =>
        s && {
          ...s,
          coins: data!.coins!,
          catalog: s.catalog.map((c) => (c.style === entry.style ? { ...c, owned: true } : c)),
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed.");
    } finally {
      setBusy(null);
    }
  }

  async function equip(entry: CatalogEntry) {
    const color = colorOf(entry);
    setBusy(entry.style);
    setError(null);
    try {
      const res = await fetch("/api/world/shop/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "outfit", style: entry.style, color }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; sheetPath?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Couldn't get changed.");
      worldBridge.emit("avatar-updated", { sheetPath: data!.sheetPath! });
      setState((s) => s && { ...s, equipped: { style: entry.style, color } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get changed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col border-3 border-ink bg-card shadow-brutal">
        {/* header */}
        <div className="flex items-center justify-between border-b-3 border-ink bg-accent-yellow px-4 py-2">
          <div>
            <h2 className="font-display text-lg font-black uppercase tracking-tight">
              Threads &amp; Such
            </h2>
            <p className="font-mono text-[10px] text-ink/60">&ldquo;{line}&rdquo; — the shopkeep</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold">
              🪙 {state?.coins ?? "…"}
            </span>
            <button
              onClick={onClose}
              className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* body */}
        <div className="overflow-y-auto p-4">
          {error && <p className="mb-3 font-bold text-accent-red">{error}</p>}
          {!state && !error && <div className="h-40 animate-pulse border-2 border-ink bg-ink/5" />}
          {state && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {state.catalog.map((entry) => {
                const color = colorOf(entry);
                const isEquipped =
                  state.equipped?.style === entry.style && state.equipped?.color === color;
                return (
                  <div key={entry.style} className="flex gap-3 border-2 border-ink p-2">
                    {state.config && (
                      <TryOnPreview
                        config={state.config}
                        outfit={{ style: entry.style, color }}
                        frameCol={frameCol}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-black">{entry.name}</p>
                      <p className="font-mono text-[10px] text-ink/50">
                        {entry.owned ? "owned" : `🪙 ${entry.price}`}
                      </p>
                      {entry.colors.length > 1 && (
                        <button
                          className="mt-1 self-start border-2 border-ink px-1.5 py-0 font-mono text-[10px]"
                          onClick={() =>
                            setColorIdx((m) => ({ ...m, [entry.style]: (m[entry.style] ?? 0) + 1 }))
                          }
                        >
                          color {((colorIdx[entry.style] ?? 0) % entry.colors.length) + 1}/
                          {entry.colors.length} ↻
                        </button>
                      )}
                      <div className="mt-auto pt-1">
                        {entry.owned ? (
                          <Button
                            type="button"
                            variant={isEquipped ? "ghost" : "green"}
                            className="!px-2 !py-0.5 !text-xs"
                            disabled={busy === entry.style || isEquipped}
                            onClick={() => equip(entry)}
                          >
                            {isEquipped ? "wearing it" : busy === entry.style ? "changing…" : "wear it"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="yellow"
                            className="!px-2 !py-0.5 !text-xs"
                            disabled={busy === entry.style || (state.coins ?? 0) < entry.price}
                            onClick={() => purchase(entry)}
                          >
                            {busy === entry.style
                              ? "haggling…"
                              : state.coins < entry.price
                                ? "can't afford"
                                : `buy · ${entry.price}`}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t-3 border-ink px-4 py-1.5">
          <p className="font-mono text-[10px] text-ink/40">
            buying a style unlocks every color, here and in the character creator
          </p>
        </div>
      </div>
    </div>
  );
}
