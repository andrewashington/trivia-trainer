"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import type { KnobDef, KnobGroup } from "@/modules/admin/knobs";

export type KnobGame = KnobGroup;

export function EconomyPanel({
  games,
  overrides,
}: {
  games: KnobGame[];
  overrides: Record<string, Record<string, unknown>>;
}) {
  const [active, setActive] = useState(games[0]?.key ?? "");
  // current edited values per game, seeded from override-or-default
  const [values, setValues] = useState<Record<string, Record<string, number | boolean>>>(() => {
    const seed: Record<string, Record<string, number | boolean>> = {};
    for (const g of games) {
      seed[g.key] = {};
      for (const k of g.knobs) {
        const ov = overrides[g.key]?.[k.id];
        seed[g.key][k.id] = typeof ov === "number" || typeof ov === "boolean" ? ov : k.default;
      }
    }
    return seed;
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const group = games.find((g) => g.key === active);

  function set(knobId: string, v: number | boolean) {
    setValues((s) => ({ ...s, [active]: { ...s[active], [knobId]: v } }));
    setStatus(null);
  }

  async function save() {
    if (!group) return;
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/economy", {
        method: "PUT",
        body: { game: active, values: values[active] },
      });
      setStatus("Saved. Live within ~15 seconds — no deploy needed.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function resetKnob(k: KnobDef) {
    set(k.id, k.default);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
      {/* game picker */}
      <div className="flex gap-2 sm:flex-col">
        {games.map((g) => (
          <button
            key={g.key}
            onClick={() => {
              setActive(g.key);
              setStatus(null);
            }}
            className={`border-3 border-ink px-3 py-1.5 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              active === g.key ? "bg-accent-red text-white" : "bg-card"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {group && (
        <div className="brutal-card space-y-4 p-4">
          <p className="font-mono text-[11px] text-ink/50">{group.blurb}</p>
          {group.knobs.map((k) => {
            const v = values[active][k.id];
            const isDefault = v === k.default;
            return (
              <div key={k.id} className="border-b border-ink/10 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold">{k.label}</span>
                  {k.danger && (
                    <span className="border-2 border-ink bg-accent-red px-1 py-px font-mono text-[9px] font-bold uppercase text-white">
                      sensitive
                    </span>
                  )}
                  {!isDefault && (
                    <button
                      onClick={() => resetKnob(k)}
                      className="border border-ink bg-card px-1 font-mono text-[10px] font-bold"
                    >
                      reset → {String(k.default)}
                    </button>
                  )}
                </div>
                {k.help && <p className="mt-0.5 font-mono text-[10px] text-ink/50">{k.help}</p>}
                <div className="mt-1.5">
                  {k.type === "bool" ? (
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(v)}
                        onChange={(e) => set(k.id, e.target.checked)}
                        className="h-4 w-4 border-2 border-ink"
                      />
                      {v ? "on" : "off"}
                    </label>
                  ) : (
                    <input
                      type="number"
                      value={typeof v === "number" ? v : 0}
                      min={k.min}
                      max={k.max}
                      step={k.step ?? (k.type === "float" ? 0.01 : 1)}
                      onChange={(e) => set(k.id, Number(e.target.value))}
                      className="w-40 border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
                    />
                  )}
                  {!isDefault && (
                    <span className="ml-2 font-mono text-[10px] text-ink/40">
                      (default {String(k.default)})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {status && <p className="font-mono text-xs font-bold">{status}</p>}
          <Button type="button" variant="yellow" disabled={busy} onClick={save}>
            {busy ? "Saving…" : `Save ${group.label}`}
          </Button>
        </div>
      )}
    </div>
  );
}
