"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui";
import { confettiBurst } from "@/lib/confetti";
import type { TreasureState } from "@/modules/treasure/state";

/**
 * The daily dig board. Click a cell to arm it, click again to dig.
 * Misses show who dug where; the chest cell is revealed once found.
 */
export function TreasureGrid({ initial }: { initial: TreasureState }) {
  const [state, setState] = useState(initial);
  const [armed, setArmed] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [justFound, setJustFound] = useState(false);

  const dayOver = state.foundBy !== null;
  const canDig = !dayOver && state.myDig === null;

  const digAt = new Map(state.digs.map((d) => [`${d.x},${d.y}`, d]));

  async function dig(x: number, y: number) {
    if (!canDig || busy) return;
    if (!armed || armed.x !== x || armed.y !== y) {
      setArmed({ x, y });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ found: boolean; pot: number; state: TreasureState }>(
        "/api/treasure",
        { method: "POST", body: { x, y } }
      );
      setState(res.state);
      setArmed(null);
      if (res.found) {
        setJustFound(true);
        confettiBurst();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Dig failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="brutal-card flex flex-wrap items-center justify-between gap-3 bg-accent-gold p-4">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink/60">
            Today&apos;s pot
          </p>
          <p className="font-display text-3xl font-bold leading-none">
            🪙 {state.pot.toLocaleString()}
          </p>
        </div>
        <p className="max-w-[16rem] font-mono text-xs leading-snug text-ink/70">
          {dayOver
            ? justFound
              ? "YOU FOUND IT! The pot is yours. 🏴‍☠️"
              : `${state.foundBy!.name} found the chest! New treasure buried tomorrow.`
            : state.myDig
              ? "You dug today — nothing but sand. If nobody finds it, the pot rolls over."
              : armed
                ? "Click the marked square again to dig. Choose wisely — one shovel a day."
                : "One dig a day. Find the chest, take the whole pot."}
        </p>
      </div>

      {/* The board */}
      <div
        className="grid aspect-square w-full max-w-md gap-1 border-3 border-ink bg-[#E8D5A3] p-2 shadow-brutal"
        style={{ gridTemplateColumns: `repeat(${state.gridSize}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: state.gridSize * state.gridSize }, (_, i) => {
          const x = i % state.gridSize;
          const y = Math.floor(i / state.gridSize);
          const dug = digAt.get(`${x},${y}`);
          const isTreasure = state.treasure?.x === x && state.treasure?.y === y;
          const isArmed = armed?.x === x && armed?.y === y;

          return (
            <button
              key={i}
              onClick={() => dig(x, y)}
              disabled={!canDig || !!dug || busy}
              title={dug ? `${dug.name} dug here` : isTreasure ? "The treasure!" : undefined}
              className={`relative flex items-center justify-center border border-ink/30 text-xs leading-none transition-transform ${
                isTreasure
                  ? "bg-accent-yellow"
                  : dug
                    ? "bg-[#C9B27E]"
                    : isArmed
                      ? "scale-110 border-2 border-ink bg-accent-red"
                      : "bg-[#DEC78F]"
              } ${canDig && !dug ? "hover:scale-110 hover:border-2 hover:border-ink hover:bg-[#D4BA7E]" : ""}`}
            >
              {isTreasure ? (
                <span className="text-sm">💰</span>
              ) : dug ? (
                <span className="pointer-events-none scale-90">
                  <Avatar name={dug.name} src={dug.avatarUrl} size="sm" title={dug.name} />
                </span>
              ) : isArmed ? (
                <span className="text-sm">⛏️</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Dig log */}
      {state.digs.length > 0 && (
        <div className="brutal-card p-4">
          <p className="brutal-label mb-2">Today&apos;s digs ({state.digs.length})</p>
          <ul className="space-y-1">
            {state.digs.map((d) => (
              <li key={d.userId} className="flex items-center gap-2 font-mono text-xs">
                <Avatar name={d.name} src={d.avatarUrl} size="sm" />
                <span>{d.name}</span>
                <span className="text-ink/50">
                  dug ({String.fromCharCode(65 + d.x)}
                  {d.y + 1}) — {d.found ? "💰 STRUCK GOLD" : "nothing"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
