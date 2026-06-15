"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

type Funnel = {
  messages: number;
  channelsWithMsgs: number;
  channelsTotal: number;
  segments: number;
  embedded: number;
  embedModel: string | null;
  embeddingsEnabled: boolean;
};
type Memory = { id: string; fact: string; subject: string | null; createdAt: string };
type AiSettings = {
  aiSystemPrompt: string;
  aiSemanticSearch: boolean;
  aiRerank: boolean;
  aiSearchLimit: number;
  aiMaxSteps: number;
  aiMaxTokens: number;
  aiModel: string;
};
type Payload = { funnel: Funnel; memories: Memory[]; settings: AiSettings };

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border-2 border-ink bg-card px-3 py-2">
      <p className="font-display text-xl font-black leading-none">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">{label}</p>
      {sub && <p className="font-mono text-[10px] text-ink/40">{sub}</p>}
    </div>
  );
}

export function AiAssistantPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [newFact, setNewFact] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const d = await api<Payload>("/api/admin/discord/ai");
      setData(d);
      setSettings(d.settings);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  function set<K extends keyof AiSettings>(k: K, v: AiSettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
    setStatus(null);
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/admin/discord/ai", { method: "PUT", body: settings });
      setStatus("Saved — live on the next message.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addMemory() {
    const fact = newFact.trim();
    if (!fact) return;
    setBusy(true);
    try {
      await api("/api/admin/discord/ai", {
        method: "POST",
        body: { fact, subject: newSubject.trim() || undefined },
      });
      setNewFact("");
      setNewSubject("");
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(id: string) {
    setBusy(true);
    try {
      await api(`/api/admin/discord/ai?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setData((d) => (d ? { ...d, memories: d.memories.filter((m) => m.id !== id) } : d));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="font-mono text-xs font-bold text-accent-red">{err}</p>;
  if (!data || !settings) return <p className="font-mono text-xs text-ink/50">Loading assistant status…</p>;

  const f = data.funnel;
  const coverage = f.channelsTotal ? Math.round((f.channelsWithMsgs / f.channelsTotal) * 100) : 0;
  const embedPct = f.segments ? Math.round((f.embedded / f.segments) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Data funnel status */}
      <div className="brutal-card space-y-3 p-3">
        <p className="brutal-label">Data funnel</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="archived messages" value={f.messages.toLocaleString("en-US")} />
          <Stat label="channels covered" value={`${f.channelsWithMsgs}/${f.channelsTotal}`} sub={`${coverage}%`} />
          <Stat label="conversation segments" value={f.segments.toLocaleString("en-US")} />
          <Stat label="embedded" value={f.embedded.toLocaleString("en-US")} sub={`${embedPct}% of segments`} />
          <Stat
            label="semantic search"
            value={<span className="text-base">{f.embeddingsEnabled ? "on" : "off"}</span>}
            sub={f.embedModel ?? "no embeddings yet"}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={load}>
            Refresh
          </Button>
          {embedPct < 100 && f.segments > 0 && (
            <p className="font-mono text-[10px] text-accent-red">
              {f.segments - f.embedded} segments not yet embedded — run `npm run discord:embed`.
            </p>
          )}
        </div>
      </div>

      {/* Memory store */}
      <div className="brutal-card space-y-3 p-3">
        <p className="brutal-label">Remembered facts ({data.memories.length})</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newFact}
            onChange={(e) => setNewFact(e.target.value)}
            placeholder="e.g. VIII's real name is Scott"
            className="flex-1 border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
          />
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="subject (optional)"
            className="w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm sm:w-40"
          />
          <Button type="button" variant="green" disabled={busy || !newFact.trim()} onClick={addMemory}>
            Add
          </Button>
        </div>
        {data.memories.length === 0 ? (
          <p className="font-mono text-[11px] text-ink/50">
            No facts yet. Add real names and who's-who here, or tell the bot &quot;remember that…&quot; in Discord.
          </p>
        ) : (
          <ul className="space-y-1">
            {data.memories.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 border-2 border-ink bg-card px-2 py-1">
                <span className="text-sm">
                  {m.subject && <span className="mr-1 font-mono text-[10px] uppercase text-ink/40">[{m.subject}]</span>}
                  {m.fact}
                </span>
                <button
                  onClick={() => deleteMemory(m.id)}
                  disabled={busy}
                  className="shrink-0 border-2 border-ink bg-accent-red px-1.5 font-mono text-[9px] font-bold uppercase text-white"
                >
                  forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tuning */}
      <div className="brutal-card space-y-3 p-3">
        <p className="brutal-label">Assistant tuning</p>
        <label className="block">
          <span className="brutal-label">Extra system prompt (appended to the base prompt)</span>
          <textarea
            value={settings.aiSystemPrompt}
            onChange={(e) => set("aiSystemPrompt", e.target.value)}
            rows={4}
            placeholder="e.g. Keep replies under 2 sentences. Never @everyone."
            className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-xs"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="brutal-label">Search limit</span>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.aiSearchLimit}
              onChange={(e) => set("aiSearchLimit", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="brutal-label">Max steps</span>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.aiMaxSteps}
              onChange={(e) => set("aiMaxSteps", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="brutal-label">Max tokens</span>
            <input
              type="number"
              min={200}
              max={4000}
              step={100}
              value={settings.aiMaxTokens}
              onChange={(e) => set("aiMaxTokens", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="brutal-label">Model override</span>
            <input
              type="text"
              value={settings.aiModel}
              placeholder="default"
              onChange={(e) => set("aiModel", e.target.value)}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => set("aiSemanticSearch", !settings.aiSemanticSearch)}
          className={`flex w-full items-center justify-between gap-3 border-2 border-ink px-3 py-2 text-left ${
            settings.aiSemanticSearch ? "bg-card" : "bg-ink/10 text-ink/40"
          }`}
        >
          <span>
            <span className="text-sm font-bold">Semantic search</span>
            <span className="block font-mono text-[10px] text-ink/50">
              embeddings-powered archive recall (off = keyword only)
            </span>
          </span>
          <span
            className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
              settings.aiSemanticSearch ? "bg-accent-green" : "bg-card"
            }`}
          >
            {settings.aiSemanticSearch ? "on" : "off"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => set("aiRerank", !settings.aiRerank)}
          className={`flex w-full items-center justify-between gap-3 border-2 border-ink px-3 py-2 text-left ${
            settings.aiRerank ? "bg-card" : "bg-ink/10 text-ink/40"
          }`}
        >
          <span>
            <span className="text-sm font-bold">LLM rerank</span>
            <span className="block font-mono text-[10px] text-ink/50">
              over-fetch then let the model judge relevance (precision; +1 call per search)
            </span>
          </span>
          <span
            className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
              settings.aiRerank ? "bg-accent-green" : "bg-card"
            }`}
          >
            {settings.aiRerank ? "on" : "off"}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="yellow" disabled={busy} onClick={saveSettings}>
            {busy ? "Saving…" : "Save tuning"}
          </Button>
          {status && <p className="font-mono text-xs font-bold">{status}</p>}
        </div>
      </div>
    </div>
  );
}
