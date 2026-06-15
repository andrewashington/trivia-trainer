import type { ZodType } from "zod";

/**
 * Runtime AI helper — OpenRouter chat completion in JSON mode, validated with
 * zod. The existing OpenRouter use (scripts/world-vision-name.ts) is build-time
 * only; this is the app-runtime entry point for the Discord assistant. Reuses
 * OPENROUTER_API_KEY; model defaults to a cheap/fast one.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";

/** True iff the runtime AI is usable (key present). Lets callers no-op cleanly. */
export function aiConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * One JSON-mode chat completion, validated against `schema`. Retries once on a
 * transient / parse / validation failure (the model is nondeterministic, so a
 * re-ask often fixes a malformed reply). Throws if it still fails.
 */
export async function chatJSON<T>(opts: {
  system: string;
  user: string;
  schema: ZodType<T>;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  const model = opts.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 1024;
  const referer = (process.env.AUTH_URL ?? "https://udm-plus.up.railway.app").replace(/\/$/, "");

  const call = async (): Promise<T> => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "UDM+ Discord assistant",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    return opts.schema.parse(JSON.parse(stripFences(content)));
  };

  try {
    return await call();
  } catch {
    return await call(); // one retry
  }
}

function headers(key: string) {
  const referer = (process.env.AUTH_URL ?? "https://udm-plus.up.railway.app").replace(/\/$/, "");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": "UDM+ Discord assistant",
  };
}

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
};

type ChatMsg =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * Agentic tool-calling loop (OpenAI-compatible, via OpenRouter). The model may
 * call read/write tools, we run them and feed the results back, repeating up to
 * `maxSteps` until it returns a plain-text answer. On the final step tools are
 * withheld so the model must produce text. Returns the model's final text.
 */
export async function runToolLoop(opts: {
  system: string;
  user: string;
  tools: ToolSpec[];
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
  model?: string;
  maxSteps?: number;
  maxTokens?: number;
  /** Per-tool-result char cap fed back to the model. Generous by default so
   * retrieval-heavy tools (search) aren't strangled before the model reads them. */
  maxToolResult?: number;
  /** Sampling temperature, if you want tighter/looser output than the default. */
  temperature?: number;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  const model = opts.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const maxSteps = opts.maxSteps ?? 5;
  const maxTokens = opts.maxTokens ?? 900;
  const maxToolResult = opts.maxToolResult ?? 8000;
  const toolsPayload = opts.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages: ChatMsg[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  for (let step = 0; step < maxSteps; step++) {
    const lastStep = step === maxSteps - 1;
    const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens };
    if (opts.temperature != null) body.temperature = opts.temperature;
    if (!lastStep) {
      body.tools = toolsPayload;
      body.tool_choice = "auto";
    }
    const res = await fetch(ENDPOINT, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) return "";
    const toolCalls = msg.tool_calls ?? [];

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      ...(toolCalls.length
        ? { tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: tc.function })) }
        : {}),
    });

    if (!toolCalls.length) return (msg.content ?? "").trim();

    // Run all tool calls in this step concurrently — when the model asks for two
    // searches (or a read + a read) at once, they shouldn't serialize. Results
    // are reassembled in call order so each lines up with its tool_call_id.
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* leave empty */
        }
        try {
          const out = await opts.execute(tc.function.name, args);
          // Observability: every tool call shows up in the logs (name, args,
          // result size) so it's clear when the loop is actually retrieving/acting.
          console.log(`[ai] step ${step} tool ${tc.function.name}(${JSON.stringify(args)}) -> ${out.length} chars`);
          return out;
        } catch (e) {
          console.log(`[ai] step ${step} tool ${tc.function.name} FAILED: ${e instanceof Error ? e.message : e}`);
          return `Error: ${e instanceof Error ? e.message : "tool failed"}`;
        }
      }),
    );
    toolCalls.forEach((tc, i) => {
      messages.push({ role: "tool", tool_call_id: tc.id, content: results[i].slice(0, maxToolResult) });
    });
  }
  return ""; // exhausted steps without a text answer
}
