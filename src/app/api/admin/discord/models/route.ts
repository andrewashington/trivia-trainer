import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/session";

/**
 * Admin helper: the list of OpenRouter models the Discord assistant can use as
 * its `aiModel` override. Two gates, both quality filters:
 *   1. eligible — takes text in / emits text out AND advertises tool calling
 *      (the assistant is an agentic tool-loop; a model without `tools` can't
 *      drive it).
 *   2. benchmarked — we then pull each model's per-provider /endpoints stats
 *      and KEEP ONLY models for which OpenRouter actually reports latency,
 *      throughput, real pricing and a context window. Models with no live
 *      stats (dead aliases, routers like openrouter/auto, never-served models)
 *      are dropped rather than offered — you can't reason about a model you
 *      have no numbers for.
 *
 * The whole thing is cached in-memory (~1h). Building it fans ~240 /endpoints
 * fetches out at concurrency 12 (~5s cold); the hourly TTL keeps the admin tab
 * snappy after that.
 */

type OrModel = {
  id: string;
  name: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
  pricing?: { prompt?: string; completion?: string };
};

type OrEndpoint = {
  context_length?: number | null;
  max_completion_tokens?: number | null;
  uptime_last_1d?: number | null;
  latency_last_30m?: { p50?: number } | null;
  throughput_last_30m?: { p50?: number } | null;
  pricing?: { prompt?: string; completion?: string };
};

export type AssistantModel = {
  id: string;
  name: string;
  /** Provider segment of the id (e.g. "anthropic") — used for grouping/labels. */
  provider: string;
  /** Context window in tokens. */
  contextLength: number;
  /** $ per 1M prompt tokens, or null when unknown. */
  promptPerM: number | null;
  /** $ per 1M completion tokens, or null when unknown. */
  completionPerM: number | null;
  /** Best (lowest) observed latency-to-first-token p50, ms, over its providers. */
  latencyMs: number;
  /** Best (highest) observed generation throughput p50, tokens/sec. */
  throughputTps: number;
  /** Best observed 1-day uptime %, across providers. */
  uptimePct: number | null;
  /** Largest max-output-tokens any provider allows (sizes the reply budget). */
  maxOutput: number | null;
};

let cache: { at: number; models: AssistantModel[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h
const CONCURRENCY = 12;

function perMillion(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null; // "-1"/"0"/missing → unknown/free
  return Math.round(n * 1_000_000 * 100) / 100;
}

/** Map a concurrency-limited async over items. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchEndpointStats(
  id: string,
  key: string,
): Promise<Pick<AssistantModel, "latencyMs" | "throughputTps" | "uptimePct" | "maxOutput" | "contextLength"> | null> {
  const res = await fetch(`https://openrouter.ai/api/v1/models/${id}/endpoints`, {
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { data?: { endpoints?: OrEndpoint[] } } | null;
  const eps = body?.data?.endpoints ?? [];
  const lat: number[] = [];
  const tput: number[] = [];
  const up: number[] = [];
  const maxOut: number[] = [];
  const ctx: number[] = [];
  for (const e of eps) {
    if (typeof e.latency_last_30m?.p50 === "number") lat.push(e.latency_last_30m.p50);
    if (typeof e.throughput_last_30m?.p50 === "number") tput.push(e.throughput_last_30m.p50);
    if (typeof e.uptime_last_1d === "number") up.push(e.uptime_last_1d);
    if (typeof e.max_completion_tokens === "number") maxOut.push(e.max_completion_tokens);
    if (typeof e.context_length === "number") ctx.push(e.context_length);
  }
  // The benchmark gate: no latency or no throughput → we drop the model.
  if (!lat.length || !tput.length) return null;
  return {
    latencyMs: Math.round(Math.min(...lat)), // best-case provider
    throughputTps: Math.round(Math.max(...tput)),
    uptimePct: up.length ? Math.round(Math.max(...up) * 10) / 10 : null,
    maxOutput: maxOut.length ? Math.max(...maxOut) : null,
    contextLength: ctx.length ? Math.max(...ctx) : 0,
  };
}

async function buildCatalog(): Promise<AssistantModel[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const { data } = (await res.json()) as { data: OrModel[] };

  // Gate 1 — eligible: tool-capable, text↔text, real (not a "~latest" alias).
  const eligible = data.filter((m) => {
    const a = m.architecture ?? {};
    const params = m.supported_parameters ?? [];
    return (
      params.includes("tools") &&
      (a.input_modalities ?? []).includes("text") &&
      (a.output_modalities ?? []).includes("text") &&
      !m.id.startsWith("~")
    );
  });

  // Gate 2 — benchmarked: must have live latency + throughput + price + ctx.
  const stats = await mapPool(eligible, CONCURRENCY, (m) => fetchEndpointStats(m.id, key));

  const models: AssistantModel[] = [];
  eligible.forEach((m, i) => {
    const s = stats[i];
    if (!s) return; // no benchmarks → dropped
    const promptPerM = perMillion(m.pricing?.prompt);
    const completionPerM = perMillion(m.pricing?.completion);
    if (completionPerM == null && promptPerM == null) return; // unpriced → dropped
    const contextLength = s.contextLength || (typeof m.context_length === "number" ? m.context_length : 0);
    if (!contextLength) return; // no context window → dropped
    models.push({
      id: m.id,
      name: m.name,
      provider: m.id.split("/")[0] ?? "other",
      contextLength,
      promptPerM,
      completionPerM,
      latencyMs: s.latencyMs,
      throughputTps: s.throughputTps,
      uptimePct: s.uptimePct,
      maxOutput: s.maxOutput,
    });
  });
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

/** GET — benchmarked, tool-capable models for the picker. */
export const GET = apiHandler(async () => {
  await requireAdmin();
  if (!cache || Date.now() - cache.at > TTL_MS) {
    cache = { at: Date.now(), models: await buildCatalog() };
  }
  return NextResponse.json({ models: cache.models, builtAt: cache.at });
});
