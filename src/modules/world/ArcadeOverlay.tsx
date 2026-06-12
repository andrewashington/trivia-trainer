"use client";

/**
 * ArcadeOverlay — the casino floor, in-world. Opened by walking onto an
 * "interaction" spot (the scene emits open-panel {panel:"arcade"} via
 * worldBridge; WorldClient renders this over the canvas).
 *
 * The games are the REAL arcade modules (CrashGame, SlotsGame, …)
 * rendered inline — same components, same /api/{game} routes, same
 * coins. Each is lazy-loaded so the world bundle doesn't pay for six
 * casinos up front. Exiting back to the floor refreshes the balance;
 * closing the overlay un-freezes the player (WorldClient emits
 * panel-closed).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { PixelIcon } from "@/components/icons";
import { modules } from "@/modules/registry";
import type { TreasureState } from "@/modules/treasure/state";

const GameLoading = () => (
  <div className="h-64 animate-pulse border-3 border-ink bg-paper" />
);

// Lazy module loads — each game's chunk arrives when its table is joined.
const CrashGame = dynamic(
  () => import("@/modules/crash/CrashGame").then((m) => m.CrashGame),
  { ssr: false, loading: GameLoading }
);
const LimboGame = dynamic(
  () => import("@/modules/limbo/LimboGame").then((m) => m.LimboGame),
  { ssr: false, loading: GameLoading }
);
const MinesGame = dynamic(
  () => import("@/modules/mines/MinesGame").then((m) => m.MinesGame),
  { ssr: false, loading: GameLoading }
);
const SlotsGame = dynamic(
  () => import("@/modules/slots/SlotsGame").then((m) => m.SlotsGame),
  { ssr: false, loading: GameLoading }
);
const BlackjackGame = dynamic(
  () => import("@/modules/blackjack/BlackjackGame").then((m) => m.BlackjackGame),
  { ssr: false, loading: GameLoading }
);
const TreasureGrid = dynamic(
  () => import("@/modules/treasure/TreasureGrid").then((m) => m.TreasureGrid),
  { ssr: false, loading: GameLoading }
);

// The floor: coin games only, in house-favorite order. Labels, icons,
// accents and pitch lines come straight from the module registry.
const FLOOR = ["slots", "blackjack", "crash", "mines", "limbo", "treasure"] as const;
type GameKey = (typeof FLOOR)[number];

const GAMES = FLOOR.map((key) => {
  const def = modules.find((m) => m.key === key);
  if (!def) throw new Error(`ArcadeOverlay: module "${key}" missing from registry`);
  return def;
});

/** Treasure's page feeds it server state; in-world we fetch the same shape. */
function TreasureLoader() {
  const [initial, setInitial] = useState<TreasureState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/api/treasure")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: TreasureState) => on && setInitial(s))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, []);
  if (failed)
    return (
      <p className="border-3 border-ink bg-paper p-4 font-mono text-xs">
        The map room is closed. Someone lost the map to the map room.
      </p>
    );
  if (!initial) return <GameLoading />;
  return <TreasureGrid initial={initial} />;
}

export function ArcadeOverlay({ onClose }: { onClose: () => void }) {
  const [coins, setCoins] = useState<number | null>(null);
  const [active, setActive] = useState<GameKey | null>(null);

  const refreshCoins = useCallback(async () => {
    try {
      const res = await fetch("/api/coins");
      if (res.ok) setCoins(((await res.json()) as { coins: number }).coins);
    } catch {
      // header just keeps showing the last known balance
    }
  }, []);

  useEffect(() => {
    refreshCoins();
  }, [refreshCoins]);

  const backToFloor = useCallback(() => {
    setActive(null);
    refreshCoins();
  }, [refreshCoins]);

  // Escape leaves the floor (not a live table — no rage-quitting a round
  // by accident; mid-game exits are the explicit buttons).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !active) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);

  const activeDef = active ? GAMES.find((g) => g.key === active) : null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col border-3 border-ink bg-card shadow-brutal">
        {/* header */}
        <div className="flex items-center justify-between border-b-3 border-ink bg-accent-gold px-4 py-2">
          <div>
            <h2 className="font-display text-lg font-black uppercase tracking-tight">
              🎰 The Casino
            </h2>
            <p className="font-mono text-[10px] text-ink/60">
              &ldquo;statistically, somebody wins.&rdquo; — management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold">
              🪙 {coins ?? "…"}
            </span>
            <button
              onClick={onClose}
              className="border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold hover:bg-paper"
              aria-label="Leave the casino"
            >
              ✕
            </button>
          </div>
        </div>

        {/* body */}
        <div className="overflow-y-auto p-4">
          {!active ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {GAMES.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setActive(g.key as GameKey)}
                  className="group border-3 border-ink bg-paper text-left shadow-brutal transition-transform hover:-translate-y-0.5"
                >
                  <div className={`h-1.5 border-b-3 border-ink ${g.accentBg}`} />
                  <div className="flex items-start gap-3 p-3">
                    <span className="mt-0.5 shrink-0">
                      <PixelIcon name={g.icon} size={22} />
                    </span>
                    <span>
                      <span className="block font-display text-sm font-black uppercase">
                        {g.label}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] leading-snug text-ink/60">
                        {g.intro}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={backToFloor}
                  className="border-2 border-ink bg-paper px-2 py-1 font-mono text-xs font-bold hover:bg-card"
                >
                  ← the floor
                </button>
                <span className="flex items-center gap-2 font-display text-sm font-black uppercase">
                  <PixelIcon name={activeDef?.icon ?? "sparkles"} size={16} />
                  {activeDef?.label}
                </span>
              </div>
              {coins === null ? (
                <GameLoading />
              ) : (
                <>
                  {active === "crash" && <CrashGame initialCoins={coins} />}
                  {active === "limbo" && <LimboGame initialCoins={coins} />}
                  {active === "mines" && <MinesGame initialCoins={coins} />}
                  {active === "slots" && <SlotsGame initialCoins={coins} />}
                  {active === "blackjack" && <BlackjackGame />}
                  {active === "treasure" && <TreasureLoader />}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
