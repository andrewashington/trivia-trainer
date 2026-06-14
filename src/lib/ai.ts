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
