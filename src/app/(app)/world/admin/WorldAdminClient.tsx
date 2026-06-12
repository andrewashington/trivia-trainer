"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import type { WorldMapDef } from "@/modules/world/maps";
import type { Runbook } from "@/modules/world/admin/runbooks";

/**
 * World console tabs. Saves write override documents to WorldConfig via
 * PUT /api/world/admin/config — only diffs from the code defaults are
 * stored, so clearing a field reverts to the default.
 */

type CatalogRow = {
  style: string;
  name: string;
  price: number;
  defaultName: string;
  defaultPrice: number;
  ownedCount: number;
};

const TABS = ["shop", "dialogue", "maps", "runbooks"] as const;
type Tab = (typeof TABS)[number];

async function putConfig(key: "cosmetics" | "dialog", value: unknown): Promise<string | null> {
  const res = await fetch("/api/world/admin/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Save failed.";
}

export function WorldAdminClient({
  catalog,
  starters,
  dialog,
  defaultDialog,
  maps,
  runbooks,
}: {
  catalog: CatalogRow[];
  starters: string[];
  dialog: Record<string, string[]>;
  defaultDialog: Record<string, string[]>;
  maps: WorldMapDef[];
  runbooks: Runbook[];
}) {
  const [tab, setTab] = useState<Tab>("shop");
  const [rows, setRows] = useState(catalog);
  const [lines, setLines] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(dialog).map(([k, v]) => [k, v.join("\n")]))
  );
  const [newNpc, setNewNpc] = useState("");
  const [openBook, setOpenBook] = useState(runbooks[0]?.id ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveShop() {
    setSaving(true);
    setStatus(null);
    // store only diffs from the code defaults
    const overrides: Record<string, { name?: string; price?: number }> = {};
    for (const r of rows) {
      const ov: { name?: string; price?: number } = {};
      if (r.name.trim() && r.name.trim() !== r.defaultName) ov.name = r.name.trim();
      if (r.price !== r.defaultPrice && r.price >= 0) ov.price = r.price;
      if (Object.keys(ov).length) overrides[r.style] = ov;
    }
    const err = await putConfig("cosmetics", overrides);
    setStatus(err ?? "Saved. Live on the next shop open.");
    setSaving(false);
  }

  async function saveDialogue() {
    setSaving(true);
    setStatus(null);
    const overrides: Record<string, string[]> = {};
    for (const [npc, text] of Object.entries(lines)) {
      const arr = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const def = defaultDialog[npc] ?? [];
      if (arr.length && arr.join("\n") !== def.join("\n")) overrides[npc] = arr;
    }
    const err = await putConfig("dialog", overrides);
    setStatus(err ?? "Saved. Live on the next page load.");
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {/* tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setStatus(null);
            }}
            className={`border-3 border-ink px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              tab === t ? "bg-accent-yellow" : "bg-card"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {status && <p className="font-mono text-xs font-bold">{status}</p>}

      {/* ── Shop pricing ── */}
      {tab === "shop" && (
        <Card className="space-y-3">
          <p className="font-mono text-[11px] text-ink/50">
            edit names + prices · blank/default = use code default · starters ({starters.join(", ")})
            are free and not listed
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-ink font-mono text-[10px] uppercase text-ink/60">
                  <th className="py-1 pr-2">style</th>
                  <th className="py-1 pr-2">name</th>
                  <th className="py-1 pr-2">price</th>
                  <th className="py-1">owned by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.style} className="border-b border-ink/10">
                    <td className="py-1 pr-2 font-mono text-xs">{r.style}</td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border-2 border-ink bg-card px-1 py-0.5 text-xs"
                        value={r.name}
                        placeholder={r.defaultName}
                        onChange={(e) =>
                          setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        min={0}
                        className="w-20 border-2 border-ink bg-card px-1 py-0.5 text-xs"
                        value={r.price}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x))
                          )
                        }
                      />
                      {r.price !== r.defaultPrice && (
                        <span className="ml-1 font-mono text-[10px] text-ink/40">
                          (default {r.defaultPrice})
                        </span>
                      )}
                    </td>
                    <td className="py-1 font-mono text-xs">{r.ownedCount || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="yellow" disabled={saving} onClick={saveShop}>
            {saving ? "Saving…" : "Save prices"}
          </Button>
        </Card>
      )}

      {/* ── Dialogue ── */}
      {tab === "dialogue" && (
        <Card className="space-y-4">
          <p className="font-mono text-[11px] text-ink/50">
            one line per row · the NPC cycles through them · &ldquo;name:shop&rdquo; keys are the
            lines in that NPC&rsquo;s shop window · map NPCs use their object name as the key
          </p>
          {Object.keys(lines).map((npc) => (
            <div key={npc}>
              <p className="brutal-label">{npc}</p>
              <textarea
                className="min-h-24 w-full border-2 border-ink bg-card p-2 font-mono text-xs"
                value={lines[npc]}
                onChange={(e) => setLines((m) => ({ ...m, [npc]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <p className="brutal-label">add NPC key</p>
              <input
                className="w-full border-2 border-ink bg-card px-2 py-1 font-mono text-xs"
                placeholder="e.g. barista — must match the npcs object name on the map"
                value={newNpc}
                onChange={(e) => setNewNpc(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const k = newNpc.trim();
                if (k && !(k in lines)) setLines((m) => ({ ...m, [k]: "" }));
                setNewNpc("");
              }}
            >
              add
            </Button>
          </div>
          <Button type="button" variant="yellow" disabled={saving} onClick={saveDialogue}>
            {saving ? "Saving…" : "Save dialogue"}
          </Button>
        </Card>
      )}

      {/* ── Maps ── */}
      {tab === "maps" && (
        <Card className="space-y-3">
          <p className="font-mono text-[11px] text-ink/50">
            registered maps (MAP_REGISTRY) · to add one, follow the &ldquo;Add a new map&rdquo;
            runbook → hand the .tmx to Claude
          </p>
          <ul className="space-y-2">
            {maps.map((m) => (
              <li key={m.id} className="border-2 border-ink p-2">
                <p className="text-sm font-black">
                  {m.label}{" "}
                  <span className="ml-1 border border-ink bg-accent-yellow/60 px-1 font-mono text-[10px] font-bold uppercase">
                    {m.kind}
                  </span>
                </p>
                <p className="font-mono text-[10px] text-ink/50">
                  id: {m.id} · source: {m.tmx}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Runbooks ── */}
      {tab === "runbooks" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {runbooks.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenBook(r.id)}
                className={`border-2 border-ink px-2 py-0.5 font-mono text-[11px] font-bold ${
                  openBook === r.id ? "bg-accent-yellow" : "bg-card"
                }`}
              >
                {r.title}
              </button>
            ))}
          </div>
          {runbooks
            .filter((r) => r.id === openBook)
            .map((r) => (
              <pre
                key={r.id}
                className="overflow-x-auto whitespace-pre-wrap border-2 border-ink bg-ink/5 p-3 font-mono text-xs leading-relaxed"
              >
                {r.body}
              </pre>
            ))}
        </Card>
      )}
    </div>
  );
}
