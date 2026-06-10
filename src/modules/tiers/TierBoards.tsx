"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Button } from "@/components/ui";
import { TIERS, TIER_COLORS, consensusTier, type Tier } from "@/modules/tiers/schema";

export type TierItemView = { id: string; label: string };

export type RankerView = {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** itemId -> placement */
  placements: Record<string, { tier: Tier; position: number }>;
};

type Slot = Tier | "unranked";
type Boards = Record<Slot, string[]>;

const SLOTS: Slot[] = [...TIERS, "unranked"];

function emptyBoards(): Boards {
  return { S: [], A: [], B: [], C: [], D: [], F: [], unranked: [] };
}

function boardsFrom(items: TierItemView[], placements: RankerView["placements"]): Boards {
  const boards = emptyBoards();
  const placed = items
    .filter((i) => placements[i.id])
    .sort((a, b) => placements[a.id].position - placements[b.id].position);
  for (const item of placed) boards[placements[item.id].tier].push(item.id);
  for (const item of items) if (!placements[item.id]) boards.unranked.push(item.id);
  return boards;
}

/** One tier row (or the unranked pool) — shared by edit + read-only views. */
function TierRow({
  slot,
  children,
  onDrop,
  onTap,
  highlight,
}: {
  slot: Slot;
  children: React.ReactNode;
  onDrop?: (e: React.DragEvent) => void;
  onTap?: () => void;
  highlight?: boolean;
}) {
  const isPool = slot === "unranked";
  return (
    <div
      className={`flex min-h-[3.25rem] border-2 border-ink ${highlight ? "ring-4 ring-accent-blue" : ""}`}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      onClick={onTap}
    >
      <div
        className="flex w-12 shrink-0 items-center justify-center border-r-2 border-ink font-display text-xl font-bold sm:w-16"
        style={{ backgroundColor: isPool ? "#E5E1D8" : TIER_COLORS[slot as Tier] }}
      >
        {isPool ? "?" : slot}
      </div>
      <div className="flex flex-1 flex-wrap content-start items-start gap-1.5 bg-card p-1.5">
        {children}
      </div>
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
  draggable,
  onDragStart,
}: {
  label: string;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`border-2 border-ink px-2 py-1 text-left font-mono text-xs sm:text-sm ${
        selected
          ? "bg-ink text-white shadow-brutal-sm"
          : onClick
            ? "bg-paper hover:bg-accent-yellow"
            : "cursor-default bg-paper"
      }`}
    >
      {label}
    </button>
  );
}

/** A read-only tier board (consensus / someone else's ranking). */
function ReadOnlyBoard({
  items,
  placements,
  noteFor,
}: {
  items: TierItemView[];
  placements: RankerView["placements"];
  noteFor?: (itemId: string) => string | null;
}) {
  const boards = boardsFrom(items, placements);
  const byId = new Map(items.map((i) => [i.id, i]));
  return (
    <div className="space-y-1.5">
      {SLOTS.map((slot) => {
        if (slot === "unranked" && boards.unranked.length === 0) return null;
        return (
          <TierRow key={slot} slot={slot}>
            {boards[slot].length === 0 && (
              <span className="px-1 py-1 font-mono text-xs text-ink/30">—</span>
            )}
            {boards[slot].map((id) => {
              const note = noteFor?.(id);
              return (
                <span key={id} className="inline-flex items-center">
                  <Chip label={byId.get(id)?.label ?? "?"} />
                  {note && (
                    <span className="-ml-0.5 border-2 border-l-0 border-ink bg-ink px-1 py-1 font-mono text-[10px] text-white">
                      {note}
                    </span>
                  )}
                </span>
              );
            })}
          </TierRow>
        );
      })}
    </div>
  );
}

export function TierBoards({
  listId,
  items,
  meId,
  rankers,
}: {
  listId: string;
  items: TierItemView[];
  meId: string;
  rankers: RankerView[];
}) {
  const router = useRouter();
  const me = rankers.find((r) => r.id === meId);
  const [boards, setBoards] = useState<Boards>(() => boardsFrom(items, me?.placements ?? {}));
  const [tab, setTab] = useState<"mine" | "consensus" | string>("mine");
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ranked = rankers.filter((r) => Object.keys(r.placements).length > 0);

  function moveItem(itemId: string, to: Slot) {
    setBoards((prev) => {
      const next = emptyBoards();
      for (const slot of SLOTS) next[slot] = prev[slot].filter((id) => id !== itemId);
      next[to] = [...next[to], itemId];
      return next;
    });
    setDirty(true);
    setSaved(false);
    setSelected(null);
  }

  async function save() {
    const placements: { itemId: string; tier: Tier; position: number }[] = [];
    for (const tier of TIERS) {
      boards[tier].forEach((itemId, position) => placements.push({ itemId, tier, position }));
    }
    if (placements.length === 0) {
      setError("Rank at least one item first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tiers/${listId}/rank`, { method: "POST", body: { placements } });
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your ranking.");
    } finally {
      setBusy(false);
    }
  }

  // Consensus: per item, average everyone's tier (S=0..F=5) and round.
  const consensus = useMemo(() => {
    const placements: RankerView["placements"] = {};
    const votes: Record<string, number> = {};
    for (const item of items) {
      const tiers = ranked
        .map((r) => r.placements[item.id]?.tier)
        .filter((t): t is Tier => Boolean(t));
      const tier = consensusTier(tiers);
      if (tier) {
        placements[item.id] = { tier, position: TIERS.indexOf(tier) * 1000 };
        votes[item.id] = tiers.length;
      }
    }
    return { placements, votes };
  }, [items, ranked]);

  const myRankedCount = TIERS.reduce((n, t) => n + boards[t].length, 0);

  return (
    <div className="space-y-4">
      {/* Tabs: mine / consensus / each ranker */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`border-2 border-ink px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider ${tab === "mine" ? "bg-ink text-white" : "bg-card hover:bg-paper"}`}
        >
          My board
        </button>
        <button
          type="button"
          onClick={() => setTab("consensus")}
          className={`border-2 border-ink px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider ${tab === "consensus" ? "bg-ink text-white" : "bg-card hover:bg-paper"}`}
        >
          Consensus ({ranked.length})
        </button>
        {ranked.map((r) => (
          <button
            key={r.id}
            type="button"
            title={`${r.name}'s board`}
            onClick={() => setTab(r.id)}
            className={`border-2 border-ink p-0.5 ${tab === r.id ? "bg-ink" : "bg-card hover:bg-paper"}`}
          >
            <Avatar name={r.name} src={r.avatarUrl} size="sm" />
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
            Drag items into a row — or tap an item, then tap its tier.
          </p>
          <div className="space-y-1.5">
            {SLOTS.map((slot) => (
              <TierRow
                key={slot}
                slot={slot}
                highlight={selected !== null}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/plain");
                  if (id && byId.has(id)) moveItem(id, slot);
                }}
                onTap={selected ? () => moveItem(selected, slot) : undefined}
              >
                {boards[slot].length === 0 && (
                  <span className="px-1 py-1 font-mono text-xs text-ink/30">
                    {slot === "unranked" ? "Everything ranked. Look at you." : "Drop here"}
                  </span>
                )}
                {boards[slot].map((id) => (
                  <Chip
                    key={id}
                    label={byId.get(id)?.label ?? "?"}
                    selected={selected === id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", id);
                      setSelected(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(selected === id ? null : id);
                    }}
                  />
                ))}
              </TierRow>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="yellow" onClick={save} disabled={busy || myRankedCount === 0}>
              {busy ? "Saving…" : "Save my ranking"}
            </Button>
            {dirty && <span className="font-mono text-xs text-ink/60">Unsaved changes</span>}
            {saved && !dirty && (
              <span className="font-mono text-xs font-bold text-accent-forest">Saved ✓</span>
            )}
          </div>
          {error && (
            <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
              {error}
            </p>
          )}
        </div>
      )}

      {tab === "consensus" &&
        (ranked.length === 0 ? (
          <p className="brutal-card p-4 font-mono text-sm text-ink/60">
            Nobody has ranked yet. Be the first — set the narrative.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
              Average tier across {ranked.length} ranking{ranked.length === 1 ? "" : "s"} — the
              little number is how many people placed it.
            </p>
            <ReadOnlyBoard
              items={items}
              placements={consensus.placements}
              noteFor={(id) => (consensus.votes[id] ? `×${consensus.votes[id]}` : null)}
            />
          </div>
        ))}

      {tab !== "mine" &&
        tab !== "consensus" &&
        (() => {
          const r = ranked.find((x) => x.id === tab);
          if (!r) return null;
          return (
            <div className="space-y-3">
              <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
                {r.name}&rsquo;s board
              </p>
              <ReadOnlyBoard items={items} placements={r.placements} />
            </div>
          );
        })()}
    </div>
  );
}
