"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { worldBridge } from "./bridge";
import {
  parseSpriteKey,
  type FurniturePlacePayload,
  type InventoryItem,
  type ShopEntry,
  type ShopVariant,
} from "./furniture";

/**
 * DecorateTray — the in-house decorate panel. Mounted by WorldClient while
 * the scene is in decorate mode (own house only). Phaser owns the room:
 * the ghost, grid-snap, drag and y-sort all happen on the canvas. This
 * tray is the catalog + controls: buy furniture, place from storage, and
 * flip/store/sell the selected piece. Money flows through the API; the
 * scene persists coordinates itself on "Done".
 */

const ASSET_BASE = "/api/world/assets";

// ── Atlas-frame previews (DOM, no Phaser) ───────────────────────────────
// Furniture sprites live in per-theme atlases; we render a single frame as
// a background-positioned div, the same trick the admin uses.

type AtlasFrame = { x: number; y: number; w: number; h: number };
type AtlasData = { image: string; size: { w: number; h: number }; frames: Record<string, AtlasFrame> };
const atlasCache = new Map<string, Promise<AtlasData>>();

function loadAtlas(atlasKey: string): Promise<AtlasData> {
  let p = atlasCache.get(atlasKey);
  if (!p) {
    p = fetch(`${ASSET_BASE}/atlas/${atlasKey}.json`)
      .then((r) => {
        if (!r.ok) throw new Error("no atlas");
        return r.json();
      })
      .then(
        (j: {
          meta: { image: string; size: { w: number; h: number } };
          frames: Record<string, { frame: AtlasFrame }>;
        }) => ({
          image: j.meta.image,
          size: j.meta.size,
          frames: Object.fromEntries(
            Object.entries(j.frames).map(([k, v]) => [k, v.frame])
          ),
        })
      );
    atlasCache.set(atlasKey, p);
  }
  return p;
}

function FurnitureSprite({ spriteKey, box = 46 }: { spriteKey: string; box?: number }) {
  const [data, setData] = useState<{ frame: AtlasFrame; image: string; size: { w: number; h: number } } | null>(
    null
  );
  useEffect(() => {
    let on = true;
    const parsed = parseSpriteKey(spriteKey);
    if (!parsed) return;
    loadAtlas(parsed.atlasKey)
      .then((a) => {
        const frame = a.frames[parsed.frame];
        if (on && frame) setData({ frame, image: a.image, size: a.size });
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [spriteKey]);

  if (!data) {
    return <div style={{ width: box, height: box }} className="bg-ink/5" aria-hidden />;
  }
  const scale = Math.min(box / data.frame.w, box / data.frame.h);
  return (
    <div
      style={{ width: box, height: box }}
      className="flex items-center justify-center"
      aria-hidden
    >
      <div
        style={{
          width: data.frame.w * scale,
          height: data.frame.h * scale,
          backgroundImage: `url(${ASSET_BASE}/atlas/${data.image})`,
          backgroundPosition: `-${data.frame.x * scale}px -${data.frame.y * scale}px`,
          backgroundSize: `${data.size.w * scale}px ${data.size.h * scale}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

// ── Tray ────────────────────────────────────────────────────────────────

type TrayData = { coins: number; catalog: ShopEntry[]; inventory: InventoryItem[] };

const placePayload = (i: InventoryItem): FurniturePlacePayload => ({
  ownedId: i.ownedId,
  name: i.name,
  spriteKey: i.spriteKey,
  price: i.price,
  surface: i.surface,
  tileW: i.tileW,
  tileH: i.tileH,
  solid: i.solid,
  flat: i.flat,
});

export function DecorateTray() {
  const [data, setData] = useState<TrayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"stuff" | "shop">("stuff");
  const [busy, setBusy] = useState<string | null>(null);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ ownedId: string; name: string } | null>(null);
  const [stats, setStats] = useState<{ placedCount: number; placedValue: number }>({
    placedCount: 0,
    placedValue: 0,
  });
  const [variantIdx, setVariantIdx] = useState<Record<string, number>>({});
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/world/furniture")
      .then((r) => {
        if (!r.ok) throw new Error("Couldn't open your storage. Try again.");
        return r.json();
      })
      .then((d: TrayData) => {
        setData(d);
        const placed = new Set(d.inventory.filter((i) => i.placed).map((i) => i.ownedId));
        setPlacedIds(placed);
        const value = d.inventory
          .filter((i) => i.placed)
          .reduce((sum, i) => sum + i.price, 0);
        setStats({ placedCount: placed.size, placedValue: value });
      })
      .catch((e) => setError(e.message));
  }, []);

  // Scene → tray sync
  useEffect(() => {
    const unsubs = [
      worldBridge.on("furniture-selected", (s) => setSelected(s)),
      worldBridge.on("furniture-deselected", () => setSelected(null)),
      worldBridge.on("furniture-placed", ({ ownedId }) =>
        setPlacedIds((s) => new Set(s).add(ownedId))
      ),
      worldBridge.on("furniture-stored", ({ ownedId }) =>
        setPlacedIds((s) => {
          const n = new Set(s);
          n.delete(ownedId);
          return n;
        })
      ),
      worldBridge.on("decorate-stats", (s) => setStats(s)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const place = useCallback((item: InventoryItem) => {
    worldBridge.emit("place-item", placePayload(item));
  }, []);

  const exit = useCallback((save: boolean) => {
    worldBridge.emit("decorate-exit", { save });
  }, []);

  async function buy(group: ShopEntry, variant: ShopVariant) {
    setBusy(variant.itemId);
    setError(null);
    try {
      const res = await fetch("/api/world/house/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: variant.itemId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; coins?: number; owned?: InventoryItem }
        | null;
      if (!res.ok || !body?.owned) throw new Error(body?.error ?? "Purchase failed.");
      const owned = body.owned;
      setData((d) =>
        d && {
          ...d,
          coins: body.coins ?? d.coins,
          inventory: [...d.inventory, owned],
          catalog: d.catalog.map((g) =>
            g.groupKey === group.groupKey
              ? {
                  ...g,
                  variants: g.variants.map((v) =>
                    v.itemId === variant.itemId ? { ...v, owned: v.owned + 1 } : v
                  ),
                }
              : g
          ),
        }
      );
      setSavedNote(`Bought ${group.name}. It's in your stuff — go place it.`);
      setTab("stuff");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed.");
    } finally {
      setBusy(null);
    }
  }

  async function sell() {
    if (!selected) return;
    const { ownedId } = selected;
    setBusy(ownedId);
    setError(null);
    try {
      const res = await fetch("/api/world/house/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownedId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; coins?: number; refund?: number }
        | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't sell that.");
      worldBridge.emit("remove-furniture", { ownedId });
      setSelected(null);
      setPlacedIds((s) => {
        const n = new Set(s);
        n.delete(ownedId);
        return n;
      });
      setData((d) =>
        d && {
          ...d,
          coins: body?.coins ?? d.coins,
          inventory: d.inventory.filter((i) => i.ownedId !== ownedId),
        }
      );
      setSavedNote(body?.refund != null ? `Sold. +🪙${body.refund} back.` : "Sold.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sell that.");
    } finally {
      setBusy(null);
    }
  }

  const stored = data?.inventory.filter((i) => !placedIds.has(i.ownedId)) ?? [];
  const inRoom = data?.inventory.filter((i) => placedIds.has(i.ownedId)) ?? [];

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1100] flex max-h-[46vh] flex-col border-t-3 border-ink bg-card shadow-brutal">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-3 border-ink bg-accent-yellow px-3 py-2">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-black uppercase tracking-tight">Decorate</h2>
          <span className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold">
            🏠 home value 🪙{stats.placedValue.toLocaleString()} · {stats.placedCount} placed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold">
            🪙 {data?.coins?.toLocaleString() ?? "…"}
          </span>
          <div className="flex border-2 border-ink">
            <button
              onClick={() => setTab("stuff")}
              className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                tab === "stuff" ? "bg-ink text-white" : "bg-card"
              }`}
            >
              My stuff
            </button>
            <button
              onClick={() => setTab("shop")}
              className={`border-l-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                tab === "shop" ? "bg-ink text-white" : "bg-card"
              }`}
            >
              Shop
            </button>
          </div>
          <Button type="button" variant="ghost" className="!px-2 !py-0.5 !text-xs" onClick={() => exit(false)}>
            cancel
          </Button>
          <Button type="button" variant="green" className="!px-2 !py-0.5 !text-xs" onClick={() => exit(true)}>
            done
          </Button>
        </div>
      </div>

      {/* selection action bar */}
      {selected && (
        <div className="flex items-center justify-between gap-2 border-b-2 border-ink bg-accent-yellow/30 px-3 py-1.5">
          <span className="truncate font-mono text-[11px] font-bold">
            ✎ {selected.name}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-0.5 !text-[11px]"
              onClick={() => worldBridge.emit("furniture-flip", undefined)}
            >
              ↔ flip
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-0.5 !text-[11px]"
              onClick={() => worldBridge.emit("furniture-store", undefined)}
            >
              ⊟ store
            </Button>
            <Button
              type="button"
              variant="yellow"
              className="!px-2 !py-0.5 !text-[11px]"
              disabled={busy === selected.ownedId}
              onClick={sell}
            >
              💰 sell · 50%
            </Button>
          </div>
        </div>
      )}

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && <p className="mb-2 font-bold text-accent-red">{error}</p>}
        {savedNote && !error && (
          <p className="mb-2 font-mono text-[11px] text-ink/60">{savedNote}</p>
        )}
        {!data && !error && <div className="h-24 animate-pulse border-2 border-ink bg-ink/5" />}

        {data && tab === "stuff" && (
          <StuffTab stored={stored} inRoom={inRoom} onPlace={place} />
        )}
        {data && tab === "shop" && (
          <ShopTab
            catalog={data.catalog}
            coins={data.coins}
            busy={busy}
            variantIdx={variantIdx}
            onCycle={(g) =>
              setVariantIdx((m) => ({
                ...m,
                [g.groupKey]: ((m[g.groupKey] ?? 0) + 1) % g.variants.length,
              }))
            }
            onBuy={buy}
          />
        )}
      </div>

      <div className="border-t-2 border-ink px-3 py-1">
        <p className="font-mono text-[10px] text-ink/40">
          drag to move · click empty space to deselect · right-click cancels placing · changes save on “done”
        </p>
      </div>
    </div>
  );
}

function StuffTab({
  stored,
  inRoom,
  onPlace,
}: {
  stored: InventoryItem[];
  inRoom: InventoryItem[];
  onPlace: (i: InventoryItem) => void;
}) {
  if (stored.length === 0 && inRoom.length === 0) {
    return (
      <p className="border-2 border-dashed border-ink/30 p-4 text-center font-mono text-xs text-ink/55">
        Your storage is a void. Hit the <span className="font-black">Shop</span> tab and buy
        something you’ll pretend was an investment.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {stored.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase text-ink/50">
            In storage — {stored.length}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {stored.map((i) => (
              <div key={i.ownedId} className="flex items-center gap-2 border-2 border-ink p-1.5">
                <FurnitureSprite spriteKey={i.spriteKey} box={42} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-[11px] font-black">{i.name}</p>
                  <Button
                    type="button"
                    variant="green"
                    className="mt-1 self-start !px-2 !py-0.5 !text-[10px]"
                    onClick={() => onPlace(i)}
                  >
                    place
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {inRoom.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase text-ink/50">
            In the room — {inRoom.length}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {inRoom.map((i) => (
              <div
                key={i.ownedId}
                className="flex flex-col items-center gap-0.5 border-2 border-ink/30 p-1.5 opacity-70"
                title="Placed — click it in the room to move, flip or sell"
              >
                <FurnitureSprite spriteKey={i.spriteKey} box={36} />
                <p className="w-full truncate text-center text-[9px] text-ink/60">{i.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShopTab({
  catalog,
  coins,
  busy,
  variantIdx,
  onCycle,
  onBuy,
}: {
  catalog: ShopEntry[];
  coins: number;
  busy: string | null;
  variantIdx: Record<string, number>;
  onCycle: (g: ShopEntry) => void;
  onBuy: (g: ShopEntry, v: ShopVariant) => void;
}) {
  if (catalog.length === 0) {
    return (
      <p className="border-2 border-dashed border-ink/30 p-4 text-center font-mono text-xs text-ink/55">
        The showroom is between shipments. The warehouse swears the furniture is “in transit.”
        Check back once it’s stocked.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
      {catalog.map((g) => {
        const idx = (variantIdx[g.groupKey] ?? 0) % g.variants.length;
        const v = g.variants[idx];
        const canAfford = coins >= v.price;
        return (
          <div key={g.groupKey} className="flex gap-2 border-2 border-ink p-2">
            <FurnitureSprite spriteKey={v.spriteKey} box={48} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-[12px] font-black">{g.name}</p>
              {g.tagline && (
                <p className="line-clamp-2 font-mono text-[9px] italic text-ink/50">{g.tagline}</p>
              )}
              {g.variants.length > 1 && (
                <button
                  className="mt-0.5 self-start border-2 border-ink px-1 py-0 font-mono text-[9px]"
                  onClick={() => onCycle(g)}
                >
                  {v.variant ?? `style ${idx + 1}`} · {idx + 1}/{g.variants.length} ↻
                </button>
              )}
              <div className="mt-auto flex items-center justify-between gap-1 pt-1">
                {v.owned > 0 && (
                  <span className="font-mono text-[9px] text-accent-meadow">owned ×{v.owned}</span>
                )}
                <Button
                  type="button"
                  variant="yellow"
                  className="ml-auto !px-2 !py-0.5 !text-[11px]"
                  disabled={busy === v.itemId || !canAfford}
                  onClick={() => onBuy(g, v)}
                >
                  {busy === v.itemId ? "…" : canAfford ? `buy · ${v.price}` : "can't afford"}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
