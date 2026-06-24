"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { ModelPicker, type AssistantModel } from "./ModelPicker";

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
  aiPromptAssistant: string;
  aiPromptSpontaneous: string;
  aiPromptRerank: string;
  aiSemanticSearch: boolean;
  aiRerank: boolean;
  aiSearchLimit: number;
  aiMaxSteps: number;
  aiMaxTokens: number;
  aiModel: string;
  spontaneousEnabled: boolean;
};
type TraceToolCall = { step: number; tool: string; args: Record<string, unknown>; result: string };
type RunTrace = { userPrompt: string; toolCalls: TraceToolCall[]; reply: string | null };
type Run = {
  id: string;
  surface: string;
  prompt: string;
  modelRequest: string;
  modelUsed: string;
  fellBack: boolean;
  ok: boolean;
  steps: number;
  toolCalls: number;
  latencyMs: number;
  error: string | null;
  reply: string | null;
  trace: RunTrace | null;
  createdAt: string;
};
type PromptDefaults = { assistant: string; spontaneous: string; rerank: string };
type Payload = { funnel: Funnel; memories: Memory[]; settings: AiSettings; runs: Run[]; promptDefaults: PromptDefaults };
type InsightsStatus = {
  status: string;
  detail: string;
  startedAt: string | null;
  lastBuiltAt: string | null;
};
/** Clamp a possibly-NaN value into [min,max], falling back when it's not a number. */
function clampInt(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border-2 border-ink bg-card px-3 py-2">
      <p className="font-display text-xl font-black leading-none">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">{label}</p>
      {sub && <p className="font-mono text-[10px] text-ink/40">{sub}</p>}
    </div>
  );
}

function PromptEditor({
  title,
  blurb,
  value,
  defaultText,
  onChange,
}: {
  title: string;
  blurb: string;
  value: string;
  defaultText: string;
  onChange: (v: string) => void;
}) {
  const overridden = value.trim() !== defaultText.trim();
  return (
    <details className="border-2 border-ink bg-card">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5">
        <span className="text-sm font-bold">{title}</span>
        <span
          className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
            overridden ? "bg-accent-yellow" : "bg-card text-ink/50"
          }`}
        >
          {overridden ? "overridden" : "default"}
        </span>
      </summary>
      <div className="space-y-2 border-t-2 border-ink p-2">
        <p className="font-mono text-[10px] text-ink/55">{blurb}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          className="w-full border-2 border-ink bg-bg px-2 py-1 font-mono text-[11px] leading-snug"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => onChange(defaultText)} disabled={!overridden}>
            Reset to default
          </Button>
        </div>
      </div>
    </details>
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
  const [insights, setInsights] = useState<InsightsStatus | null>(null);
  const [models, setModels] = useState<AssistantModel[] | null>(null);
  const [modelsErr, setModelsErr] = useState(false);

  async function load() {
    try {
      const d = await api<Payload>("/api/admin/discord/ai");
      setData(d);
      setSettings({
        ...d.settings,
        aiPromptAssistant: d.settings.aiPromptAssistant || d.promptDefaults.assistant,
        aiPromptSpontaneous: d.settings.aiPromptSpontaneous || d.promptDefaults.spontaneous,
        aiPromptRerank: d.settings.aiPromptRerank || d.promptDefaults.rerank,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    }
  }
  async function loadInsights() {
    try {
      setInsights(await api<InsightsStatus>("/api/admin/discord/insights"));
    } catch {
      /* table may not exist before first deploy — ignore */
    }
  }
  async function loadModels() {
    try {
      const r = await api<{ models: AssistantModel[] }>("/api/admin/discord/models");
      setModels(r.models);
      setModelsErr(false);
    } catch {
      // OpenRouter unreachable / no key — fall back to a plain text field.
      setModelsErr(true);
    }
  }
  useEffect(() => {
    load();
    loadInsights();
    loadModels();
  }, []);

  async function rebuildInsights() {
    setBusy(true);
    setStatus("Kicking off the insights rebuild…");
    try {
      await api("/api/admin/discord/insights", { method: "POST", body: {} });
      setStatus("Rebuild running in the background (a few minutes). Refresh to check.");
      setTimeout(loadInsights, 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Rebuild failed to start.");
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof AiSettings>(k: K, v: AiSettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
    setStatus(null);
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    setStatus(null);
    // Clamp the numeric knobs to the server's accepted range here so a value
    // that's mid-edit, blank, or out of bounds can never 400 the save. The
    // clamped values are written back so the inputs reflect what was saved.
    const clean: AiSettings = {
      ...settings,
      aiSearchLimit: clampInt(settings.aiSearchLimit, 1, 30, 12),
      aiMaxSteps: clampInt(settings.aiMaxSteps, 1, 12, 6),
      aiMaxTokens: clampInt(settings.aiMaxTokens, 200, 8000, 1800),
      aiModel: settings.aiModel.trim().slice(0, 100),
      aiSystemPrompt: settings.aiSystemPrompt.slice(0, 4000),
      aiPromptAssistant: settings.aiPromptAssistant.slice(0, 8000),
      aiPromptSpontaneous: settings.aiPromptSpontaneous.slice(0, 8000),
      aiPromptRerank: settings.aiPromptRerank.slice(0, 8000),
    };
    setSettings(clean);
    try {
      await api("/api/admin/discord/ai", { method: "PUT", body: clean });
      setStatus("Saved — live on the next message.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function postNow() {
    setBusy(true);
    setStatus("Conjuring something…");
    try {
      const r = await api<{ result: string }>("/api/admin/discord/ai?action=spontaneous", { method: "POST", body: {} });
      setStatus(`Posted to the channel → ${r.result}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Post failed.");
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

      {/* Discord Stats insights */}
      <div className="brutal-card space-y-3 p-3">
        <p className="brutal-label">Discord Stats insights</p>
        <p className="font-mono text-[11px] text-ink/55">
          Crunches the embeddings into the Vibe Galaxy, AI dossiers, semantic soulmates &amp; the group
          lexicon. Rebuild after a big new backfill (runs in the background, a few minutes).
        </p>
        {insights && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
            <span>
              status: <b className={insights.status === "error" ? "text-accent-red" : ""}>{insights.status}</b>
            </span>
            {insights.lastBuiltAt && <span>last built: {new Date(insights.lastBuiltAt).toLocaleString()}</span>}
            {insights.detail && <span className="text-ink/50">{insights.detail}</span>}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="green"
            disabled={busy || insights?.status === "running"}
            onClick={rebuildInsights}
          >
            {insights?.status === "running" ? "Rebuilding…" : "Rebuild insights"}
          </Button>
          <Button type="button" variant="ghost" onClick={loadInsights}>
            Refresh
          </Button>
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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="brutal-label">Search limit</span>
            <input
              type="number"
              min={1}
              max={30}
              value={Number.isFinite(settings.aiSearchLimit) ? settings.aiSearchLimit : ""}
              onChange={(e) => set("aiSearchLimit", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="brutal-label">Max steps</span>
            <input
              type="number"
              min={1}
              max={12}
              value={Number.isFinite(settings.aiMaxSteps) ? settings.aiMaxSteps : ""}
              onChange={(e) => set("aiMaxSteps", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="brutal-label">Max tokens</span>
            <input
              type="number"
              min={200}
              max={8000}
              step={100}
              value={Number.isFinite(settings.aiMaxTokens) ? settings.aiMaxTokens : ""}
              onChange={(e) => set("aiMaxTokens", Number(e.target.value))}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="brutal-label">Model</span>
          {models && !modelsErr ? (
            <ModelPicker value={settings.aiModel} models={models} onChange={(id) => set("aiModel", id)} />
          ) : (
            <input
              type="text"
              value={settings.aiModel}
              placeholder={modelsErr ? "model id (couldn't reach OpenRouter)" : "loading models…"}
              onChange={(e) => set("aiModel", e.target.value)}
              className="mt-1 w-full border-2 border-ink bg-card px-2 py-1 font-mono text-sm"
            />
          )}
          <span className="mt-1 block font-mono text-[10px] text-ink/45">
            Leave on Default to use the env model. A bad pick can&apos;t brick the bot — it falls back to the default
            automatically.
          </span>
        </label>
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
        <button
          type="button"
          onClick={() => set("spontaneousEnabled", !settings.spontaneousEnabled)}
          className={`flex w-full items-center justify-between gap-3 border-2 border-ink px-3 py-2 text-left ${
            settings.spontaneousEnabled ? "bg-card" : "bg-ink/10 text-ink/40"
          }`}
        >
          <span>
            <span className="text-sm font-bold">Spontaneous posts</span>
            <span className="block font-mono text-[10px] text-ink/50">
              the bot drops its own content (~every 6h; interval is an Economy knob)
            </span>
          </span>
          <span
            className={`shrink-0 border-2 border-ink px-1.5 font-mono text-[9px] font-bold uppercase ${
              settings.spontaneousEnabled ? "bg-accent-green" : "bg-card"
            }`}
          >
            {settings.spontaneousEnabled ? "on" : "off"}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="yellow" disabled={busy} onClick={saveSettings}>
            {busy ? "Saving…" : "Save tuning"}
          </Button>
          <Button type="button" variant="green" disabled={busy} onClick={postNow}>
            Post something now
          </Button>
          {status && <p className="font-mono text-xs font-bold">{status}</p>}
        </div>
      </div>

      {/* Full system-prompt overrides — for testing & tweaking */}
      <div className="brutal-card space-y-3 p-3">
        <p className="brutal-label">System prompts (advanced)</p>
        <p className="font-mono text-[11px] text-ink/55">
          Rewrite the actual system prompts the assistant runs on. Leave one untouched to use the shipped default; a
          tweak here goes live on the next message. The &quot;extra system prompt&quot; above still appends to whatever
          base prompt is active.
        </p>
        <PromptEditor
          title="Assistant brain (the /udm + @mention prompt)"
          blurb="The core instructions for answering, searching the archive, and taking actions. The biggest lever on behaviour."
          value={settings.aiPromptAssistant}
          defaultText={data.promptDefaults.assistant}
          onChange={(v) => set("aiPromptAssistant", v)}
        />
        <PromptEditor
          title="Spontaneous posts (the unprompted-content prompt)"
          blurb="Drives what the bot invents when it posts on its own (polls, tier lists, predictions, images…)."
          value={settings.aiPromptSpontaneous}
          defaultText={data.promptDefaults.spontaneous}
          onChange={(v) => set("aiPromptSpontaneous", v)}
        />
        <PromptEditor
          title="Archive rerank judge"
          blurb="Judges which archived conversation snippets actually answer a search. Only used when LLM rerank is on."
          value={settings.aiPromptRerank}
          defaultText={data.promptDefaults.rerank}
          onChange={(v) => set("aiPromptRerank", v)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="yellow" disabled={busy} onClick={saveSettings}>
            {busy ? "Saving…" : "Save prompts"}
          </Button>
          {status && <p className="font-mono text-xs font-bold">{status}</p>}
        </div>
      </div>

      {/* Recent runs — troubleshooting trace */}
      <div className="brutal-card space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="brutal-label">Recent runs ({data.runs.length})</p>
          <Button type="button" variant="ghost" onClick={load}>
            Refresh
          </Button>
        </div>
        <p className="font-mono text-[11px] text-ink/55">
          The last 25 assistant invocations — what model actually ran, how long it took, and the error if it failed.
          A <b>fell-back</b> tag means the configured model errored and the default caught it.
        </p>
        {data.runs.length === 0 ? (
          <p className="font-mono text-[11px] text-ink/50">
            No runs logged yet. Ask the bot something (/udm or @mention) and it&apos;ll show up here.
          </p>
        ) : (
          <ul className="space-y-1">
            {data.runs.map((r) => (
              <li key={r.id} className="border-2 border-ink bg-card px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px]">
                  <span className={`border-2 border-ink px-1 font-bold uppercase ${r.ok ? "bg-accent-green" : "bg-accent-red text-white"}`}>
                    {r.ok ? "ok" : "fail"}
                  </span>
                  <span className="uppercase text-ink/40">{r.surface}</span>
                  <span className="font-bold">{r.modelUsed}</span>
                  {r.fellBack && (
                    <span className="border-2 border-ink bg-accent-yellow px-1 font-bold uppercase" title={`configured: ${r.modelRequest || "default"}`}>
                      fell-back
                    </span>
                  )}
                  <span className="text-ink/45">
                    {r.steps} step{r.steps === 1 ? "" : "s"} · {r.toolCalls} tool · {(r.latencyMs / 1000).toFixed(1)}s
                  </span>
                  <span className="ml-auto text-ink/40">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink/70" title={r.prompt}>
                  {"“"}{r.prompt}{"”"}
                </p>
                {r.error && <p className="mt-0.5 font-mono text-[10px] font-bold text-accent-red">{r.error}</p>}
                {r.trace !== null && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-mono text-[10px] text-ink/50">expand trace</summary>
                    <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-snug text-ink/60">
                      {JSON.stringify(r.trace, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RunCard({ r }: { r: Run }) {
  const tc = r.trace?.toolCalls ?? [];
  const okClass = r.ok ? "bg-accent-green" : "bg-accent-red text-white";
  const stepText = r.steps === 1 ? "1 step" : r.steps + " steps";
  const latency = (r.latencyMs / 1000).toFixed(1) + "s";
  return (
    <li className="border-2 border-ink bg-card">
      <details>
        <summary className="cursor-pointer px-2 py-1.5">
          <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px]">
            <span className={"border-2 border-ink px-1 font-bold uppercase " + okClass}>
              {r.ok ? "ok" : "fail"}
            </span>
            <span className="uppercase text-ink/40">{r.surface}</span>
            <span className="font-bold">{r.modelUsed}</span>
            {r.fellBack && (
              <span className="border-2 border-ink bg-accent-yellow px-1 font-bold uppercase" title={"configured: " + (r.modelRequest || "default")}>
                fell-back
              </span>
            )}
            <span className="text-ink/45">{stepText} {"·"} {r.toolCalls} tool {"·"} {latency}</span>
            <span className="text-ink/40">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink/70" title={r.prompt}>
            {"“"}{r.prompt}{"”"}
          </p>
          {r.error && <p className="mt-0.5 font-mono text-[10px] font-bold text-accent-red">{r.error}</p>}
        </summary>

        <div className="space-y-2 border-t-2 border-ink/20 p-2">
          {r.trace?.userPrompt && (
            <details className="border border-ink/20">
              <summary className="cursor-pointer px-2 py-1 font-mono text-[10px] uppercase text-ink/50">
                Prompt sent to model
              </summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-2 py-1 font-mono text-[10px] leading-snug text-ink/70">
                {r.trace.userPrompt}
              </pre>
            </details>
          )}
          {tc.length !== 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase text-ink/50">Tool calls</p>
              {tc.map((call, i) => (
                <ToolCallCard key={i} call={call} />
              ))}
            </div>
          )}
          {r.trace?.reply && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase text-ink/50">Reply</p>
              <p className="font-mono text-[11px] leading-snug text-ink/80">{r.trace.reply}</p>
            </div>
          )}
          {!r.trace && (
            <p className="font-mono text-[10px] text-ink/40">No trace {"—"} run pre-dates this feature.</p>
          )}
        </div>
      </details>
    </li>
  );
}

function ToolCallCard({ call }: { call: TraceToolCall }) {
  const argSummary = Object.entries(call.args ?? {}).map(([k, v]) => {
    const val = typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40);
    return k + "=" + val;
  }).join(", ");
  return (
    <details className="border border-ink/20">
      <summary className="cursor-pointer px-2 py-1 font-mono text-[10px]">
        <span className="text-ink/40">step {call.step}</span>
        {" "}
        <span className="font-bold text-accent-blue">{call.tool}</span>
        {argSummary && <span className="ml-1 text-ink/50">({argSummary})</span>}
      </summary>
      <div className="border-t border-ink/20 px-2 py-1">
        <p className="mb-1 font-mono text-[9px] uppercase text-ink/40">Args</p>
        <pre className="mb-2 whitespace-pre-wrap font-mono text-[10px] text-ink/70">
          {JSON.stringify(call.args, null, 2)}
        </pre>
        <p className="mb-1 font-mono text-[9px] uppercase text-ink/40">Result</p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-snug text-ink/70">
          {call.result}
        </pre>
      </div>
    </details>
  );
}
