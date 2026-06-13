"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

export type Promo = {
  key: string;
  amount: number;
  cadence: "once" | "daily";
  title: string;
  body: string;
  cta: string;
  ledgerLabel: string;
  enabled: boolean;
};

const BLANK: Promo = {
  key: "",
  amount: 100,
  cadence: "once",
  title: "Free coins are on the table",
  body: "Take them. Spend them badly, proudly, or both.",
  cta: "Claim 100",
  ledgerLabel: "Claimed a free coin drop",
  enabled: true,
};

export function PromosPanel({ initial }: { initial: Promo[] }) {
  const [promos, setPromos] = useState<Promo[]>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function update(i: number, patch: Partial<Promo>) {
    setPromos((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    setStatus(null);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/promos", { method: "PUT", body: { rewards: promos } });
      setStatus("Saved. The banner offers the first enabled campaign a member can still claim.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] text-ink/50">
        the headline banner shows the first <b>enabled</b> campaign in this order · &ldquo;daily&rdquo;
        resets every calendar day, &ldquo;once&rdquo; is claimable a single time ever
      </p>

      {promos.map((p, i) => (
        <div
          key={i}
          className={`brutal-card space-y-2 p-4 ${p.enabled ? "" : "opacity-60"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={p.key}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder="campaign-key"
              className="w-44 border-2 border-ink bg-card px-2 py-1 font-mono text-xs"
            />
            <select
              value={p.cadence}
              onChange={(e) => update(i, { cadence: e.target.value as "once" | "daily" })}
              className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs"
            >
              <option value="once">once</option>
              <option value="daily">daily</option>
            </select>
            <label className="inline-flex items-center gap-1.5 font-mono text-xs">
              <input
                type="number"
                min={1}
                value={p.amount}
                onChange={(e) => update(i, { amount: Number(e.target.value) })}
                className="w-24 border-2 border-ink bg-card px-2 py-1"
              />
              coins
            </label>
            <label className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs font-bold">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                className="h-4 w-4 border-2 border-ink"
              />
              {p.enabled ? "live" : "paused"}
            </label>
            <button
              onClick={() => setPromos((ps) => ps.filter((_, j) => j !== i))}
              className="border-2 border-ink bg-card px-2 py-1 font-mono text-xs font-bold"
            >
              remove
            </button>
          </div>
          <input
            value={p.title}
            onChange={(e) => update(i, { title: e.target.value })}
            placeholder="title"
            className="w-full border-2 border-ink bg-card px-2 py-1 text-sm font-bold"
          />
          <textarea
            value={p.body}
            onChange={(e) => update(i, { body: e.target.value })}
            placeholder="body"
            className="min-h-16 w-full border-2 border-ink bg-card px-2 py-1 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={p.cta}
              onChange={(e) => update(i, { cta: e.target.value })}
              placeholder="button label"
              className="w-44 border-2 border-ink bg-card px-2 py-1 text-sm"
            />
            <input
              value={p.ledgerLabel}
              onChange={(e) => update(i, { ledgerLabel: e.target.value })}
              placeholder="ledger label"
              className="min-w-0 flex-1 border-2 border-ink bg-card px-2 py-1 font-mono text-xs"
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setPromos((ps) => [...ps, { ...BLANK }])}
        >
          + Add campaign
        </Button>
        <Button type="button" variant="yellow" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save campaigns"}
        </Button>
        {status && <p className="font-mono text-xs font-bold">{status}</p>}
      </div>
    </div>
  );
}
