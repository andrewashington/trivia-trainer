"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A searchable, benchmark-rich picker over the OpenRouter models the assistant
 * can use. A native <select> can't render per-row pills, so this is a custom
 * combobox: type to filter, sort by name / cost / context / speed, and every
 * row wears relative-reference pills (context bucket · cost tier · speed)
 * instead of raw numbers — the exact figures live in the tooltip, and the
 * currently-selected model gets a full stat strip below the control. The list
 * only ever contains models OpenRouter reports live stats for (the API does
 * that filtering), so there are no mystery-meat entries. "Default" (the
 * env/Haiku fallback) is always pinned at the top.
 */

export type AssistantModel = {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  promptPerM: number | null;
  completionPerM: number | null;
  latencyMs: number;
  throughputTps: number;
  uptimePct: number | null;
  maxOutput: number | null;
};

// --- relative-reference buckets (thresholds from the live distribution) ----

/** Context window → S / M / L / XL / 1M reference bucket. */
function contextTier(tokens: number): { label: string; rank: number } {
  if (tokens >= 1_000_000) return { label: "1M", rank: 5 };
  if (tokens >= 200_000) return { label: "XL", rank: 4 };
  if (tokens >= 100_000) return { label: "L", rank: 3 };
  if (tokens >= 32_000) return { label: "M", rank: 2 };
  return { label: "S", rank: 1 };
}

/** Blended $/1M (output-weighted) → $ / $$ / $$$ / $$$$ tier, or "free". */
function costTier(m: AssistantModel): { label: string; rank: number } {
  const p = m.promptPerM;
  const c = m.completionPerM;
  if (p == null && c == null) return { label: "free", rank: 0 };
  const blended = (p ?? c ?? 0) * 0.25 + (c ?? p ?? 0) * 0.75;
  if (blended <= 0) return { label: "free", rank: 0 };
  if (blended < 1) return { label: "$", rank: 1 };
  if (blended < 5) return { label: "$$", rank: 2 };
  if (blended < 15) return { label: "$$$", rank: 3 };
  return { label: "$$$$", rank: 4 };
}

/** Latency-to-first-token p50 → snappy / brisk / slow (median ≈ 700ms live). */
function speedTier(latencyMs: number): { label: string; rank: number } {
  if (latencyMs <= 600) return { label: "⚡ snappy", rank: 1 };
  if (latencyMs <= 1500) return { label: "brisk", rank: 2 };
  return { label: "🐢 slow", rank: 3 };
}

function fmtContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M token context`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k token context`;
  return `${tokens} token context`;
}

function fmtCost(m: AssistantModel): string {
  if (m.promptPerM == null && m.completionPerM == null) return "free / unmetered";
  const p = m.promptPerM == null ? "?" : `$${m.promptPerM}`;
  const c = m.completionPerM == null ? "?" : `$${m.completionPerM}`;
  return `${p} in / ${c} out · per 1M tokens`;
}

function fmtSpeed(m: AssistantModel): string {
  return `~${m.latencyMs}ms to first token · ~${m.throughputTps} tok/s${
    m.uptimePct != null ? ` · ${m.uptimePct}% uptime (1d)` : ""
  }`;
}

function Pill({
  children,
  title,
  tone = "plain",
}: {
  children: React.ReactNode;
  title?: string;
  tone?: "plain" | "cost" | "speed";
}) {
  const bg = tone === "cost" ? "bg-accent-yellow" : tone === "speed" ? "bg-accent-green/50" : "bg-card";
  return (
    <span
      title={title}
      className={`shrink-0 border-2 border-ink px-1 font-mono text-[9px] font-bold uppercase leading-tight ${bg}`}
    >
      {children}
    </span>
  );
}

type SortKey = "name" | "cost" | "context" | "speed";

export function ModelPicker({
  value,
  models,
  onChange,
  defaultLabel = "Default (env / Haiku 4.5)",
}: {
  value: string;
  models: AssistantModel[];
  onChange: (id: string) => void;
  defaultLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value ? models.find((m) => m.id === value) : null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? models.filter((m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle))
      : models.slice();
    list.sort((a, b) => {
      if (sort === "cost") return costTier(a).rank - costTier(b).rank || a.name.localeCompare(b.name);
      if (sort === "context") return contextTier(b.contextLength).rank - contextTier(a.contextLength).rank || a.name.localeCompare(b.name);
      if (sort === "speed") return a.latencyMs - b.latencyMs;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [models, q, sort]);

  // The value may be a model that's no longer in the list (or never was —
  // someone typed a custom id, or an old saved model fell out of the benchmark
  // gate). Show it honestly rather than blanking out.
  const selectedLabel = value ? (selected ? selected.name : value) : defaultLabel;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between gap-2 border-2 border-ink bg-card px-2 py-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-sm">{selectedLabel}</span>
          {selected && (
            <>
              <Pill title={fmtContext(selected.contextLength)}>{contextTier(selected.contextLength).label}</Pill>
              <Pill tone="cost" title={fmtCost(selected)}>
                {costTier(selected).label}
              </Pill>
              <Pill tone="speed" title={fmtSpeed(selected)}>
                {speedTier(selected.latencyMs).label}
              </Pill>
            </>
          )}
          {value && !selected && <Pill title="not in the current benchmarked list">custom</Pill>}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink/50">{open ? "▲" : "▼"}</span>
      </button>

      {/* Stat strip for the chosen model — the real numbers behind the pills. */}
      {selected && (
        <p className="mt-1 font-mono text-[10px] text-ink/55">
          {fmtContext(selected.contextLength)} · {fmtCost(selected)} · {fmtSpeed(selected)}
          {selected.maxOutput != null && ` · ${selected.maxOutput.toLocaleString("en-US")} max output`}
        </p>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full border-2 border-ink bg-card shadow-[4px_4px_0_0_var(--ink)]">
          <div className="flex items-center gap-1 border-b-2 border-ink p-1.5">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Filter ${models.length} benchmarked models…`}
              className="min-w-0 flex-1 border-2 border-ink bg-bg px-2 py-1 font-mono text-xs"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="shrink-0 border-2 border-ink bg-bg px-1 py-1 font-mono text-[10px] uppercase"
              title="Sort"
            >
              <option value="name">A–Z</option>
              <option value="cost">Cheapest</option>
              <option value="context">Biggest ctx</option>
              <option value="speed">Fastest</option>
            </select>
          </div>

          <ul className="max-h-72 overflow-y-auto">
            {/* Default option, always first. */}
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 border-b border-ink/20 px-2 py-1.5 text-left hover:bg-accent-green/30 ${
                  value === "" ? "bg-accent-green/40" : ""
                }`}
              >
                <span className="font-mono text-xs font-bold">{defaultLabel}</span>
                <span className="font-mono text-[9px] uppercase text-ink/40">fallback</span>
              </button>
            </li>
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 border-b border-ink/10 px-2 py-1.5 text-left hover:bg-accent-green/30 ${
                    value === m.id ? "bg-accent-green/40" : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-bold leading-tight">{m.name}</span>
                    <span className="truncate font-mono text-[10px] text-ink/45">{m.id}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Pill title={fmtContext(m.contextLength)}>{contextTier(m.contextLength).label}</Pill>
                    <Pill tone="cost" title={fmtCost(m)}>
                      {costTier(m).label}
                    </Pill>
                    <Pill tone="speed" title={fmtSpeed(m)}>
                      {speedTier(m.latencyMs).label}
                    </Pill>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-center font-mono text-[11px] text-ink/50">no models match “{q}”</li>
            )}
          </ul>

          <p className="border-t-2 border-ink px-2 py-1 font-mono text-[9px] leading-snug text-ink/45">
            ctx S→1M · cost $→$$$$ per-1M (output-weighted) · speed = latency to first token · hover for exact numbers
          </p>
        </div>
      )}
    </div>
  );
}
