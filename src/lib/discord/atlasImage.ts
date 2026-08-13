/**
 * Image generation via Atlas Cloud (https://api.atlascloud.ai). Unlike the
 * OpenRouter path (one synchronous chat call that returns a data URL), Atlas is
 * async: POST a job, poll the prediction until it completes, then fetch the
 * output URL for the bytes. Its draw is breadth — ~40+ text-to-image models
 * (flux, imagen, seedream, nano-banana, gpt-image, qwen…) selectable per call.
 *
 * Returns the same { buffer, mimeType } shape as image.ts so callers can treat
 * the two providers interchangeably. Uses ATLAS_API_KEY; the default model is
 * ATLAS_IMAGE_MODEL (or DEFAULT_ATLAS_MODEL below).
 */
import type { GeneratedImage } from "@/lib/discord/image";

const API = "https://api.atlascloud.ai/api/v1";
const DEFAULT_ATLAS_MODEL = "google/nano-banana/text-to-image";

/** How long to wait for a prediction before giving up (well inside Discord's
 * 15-min interaction-token window, which is what bounds the reply). */
const POLL_DEADLINE_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

export type AtlasModel = { id: string; name: string; price: number | null };

/**
 * Friendly aliases → concrete model ids, so a request like "use the fast one"
 * or "draw it with flux" resolves without anyone memorizing model ids. Anything
 * not matched here falls through to a live-catalog fuzzy match (resolveModel).
 */
const ALIASES: Record<string, string> = {
  fast: "black-forest-labs/flux-schnell",
  cheap: "black-forest-labs/flux-schnell",
  quick: "black-forest-labs/flux-schnell",
  flux: "black-forest-labs/flux-dev",
  "flux-pro": "black-forest-labs/flux-2-pro/text-to-image",
  photoreal: "google/imagen4",
  photo: "google/imagen4",
  realistic: "google/imagen4",
  imagen: "google/imagen4",
  gpt: "openai/gpt-image-1",
  openai: "openai/gpt-image-1",
  dalle: "openai/gpt-image-1",
  seedream: "bytedance/seedream-v4",
  qwen: "qwen/qwen-image-2.0/text-to-image",
  nano: "google/nano-banana/text-to-image",
  banana: "google/nano-banana/text-to-image",
  gemini: "google/nano-banana/text-to-image",
  google: "google/nano-banana/text-to-image",
  best: "google/nano-banana-pro/text-to-image",
  pro: "google/nano-banana-pro/text-to-image",
  ultra: "google/nano-banana-pro/text-to-image-ultra",
  quality: "google/nano-banana-pro/text-to-image",
};

function authHeaders(key: string) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export function atlasConfigured(): boolean {
  return !!process.env.ATLAS_API_KEY;
}

export function defaultAtlasModel(): string {
  return process.env.ATLAS_IMAGE_MODEL || DEFAULT_ATLAS_MODEL;
}

// Live catalog is small and changes rarely — cache it for an hour so picking a
// model doesn't cost a round-trip every image.
let catalogCache: { at: number; models: AtlasModel[] } | null = null;
const CATALOG_TTL_MS = 60 * 60 * 1000;

/** The text-to-image models Atlas currently offers, cheapest first. */
export async function listAtlasImageModels(): Promise<AtlasModel[]> {
  const key = process.env.ATLAS_API_KEY;
  if (!key) return [];
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.models;
  try {
    const res = await fetch(`${API}/models`, { headers: authHeaders(key) });
    if (!res.ok) return catalogCache?.models ?? [];
    const json = (await res.json()) as {
      data?: { model: string; displayName?: string; categories?: string[]; price?: { actual?: { base_price?: string | number } } }[];
    };
    const models = (json.data ?? [])
      .filter((m) => (m.categories ?? []).includes("TEXT-TO-IMAGE"))
      .map((m) => ({
        id: m.model,
        name: m.displayName ?? m.model,
        price: m.price?.actual?.base_price != null ? Number(m.price.actual.base_price) : null,
      }))
      .sort((a, b) => (a.price ?? 99) - (b.price ?? 99));
    catalogCache = { at: Date.now(), models };
    return models;
  } catch (err) {
    console.error("[discord] atlas listModels failed", err);
    return catalogCache?.models ?? [];
  }
}

/**
 * Resolve a free-form model hint to a real Atlas model id: alias map first, then
 * exact id, then a substring match on id/name against the live catalog. Falls
 * back to the default model when nothing matches (so a bad hint never errors).
 */
export async function resolveAtlasModel(hint?: string | null): Promise<string> {
  const fallback = defaultAtlasModel();
  const q = (hint ?? "").trim().toLowerCase();
  if (!q) return fallback;
  if (ALIASES[q]) return ALIASES[q];
  const models = await listAtlasImageModels();
  // Catalog unreachable: an exact-looking id (has a provider/ segment) is
  // trusted as-is so the admin-picked model still applies; keywords fall back.
  if (!models.length) return q.includes("/") ? q : fallback;
  const exact = models.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact.id;
  const partial = models.find((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
  return partial?.id ?? fallback;
}

/** Map a friendly aspect to an Atlas size string (`W*H`). */
export function atlasSize(aspect?: string | null): string {
  switch ((aspect ?? "").trim().toLowerCase()) {
    case "landscape":
    case "wide":
      return "1344*768";
    case "portrait":
    case "tall":
      return "768*1344";
    default:
      return "1024*1024";
  }
}

/**
 * Generate one image with Atlas. Returns { buffer, mimeType } or null on any
 * failure (missing key, job error, timeout) so callers can no-op / fall back.
 */
export async function generateAtlasImage(
  prompt: string,
  opts: { model?: string; size?: string } = {}
): Promise<GeneratedImage | null> {
  const key = process.env.ATLAS_API_KEY;
  if (!key) return null;
  const model = opts.model || defaultAtlasModel();
  const size = opts.size || "1024*1024";
  const headers = authHeaders(key);

  try {
    const start = (await fetch(`${API}/model/generateImage`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt: prompt.slice(0, 2000), size }),
    }).then((r) => r.json())) as { code?: number | string; message?: string; data?: { id?: string } };

    if (Number(start?.code) !== 200 || !start?.data?.id) {
      console.error(`[discord] atlas generateImage rejected: ${start?.message || JSON.stringify(start).slice(0, 200)}`);
      return null;
    }
    const id = start.data.id;

    const deadline = Date.now() + POLL_DEADLINE_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const poll = (await fetch(`${API}/model/prediction/${id}`, { headers }).then((r) => r.json())) as {
        data?: { status?: string; outputs?: string[] | null; error?: string };
      };
      const d = poll?.data ?? {};
      if (d.status === "completed" && Array.isArray(d.outputs) && d.outputs.length) {
        const url = d.outputs[0];
        const imgRes = await fetch(url);
        if (!imgRes.ok) {
          console.error(`[discord] atlas output fetch ${imgRes.status}`);
          return null;
        }
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const fromHeader = imgRes.headers.get("content-type")?.split(";")[0]?.trim();
        const fromExt = url.split("?")[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1];
        const mimeType =
          (fromHeader && /^image\//.test(fromHeader) && fromHeader) ||
          (fromExt ? `image/${fromExt.toLowerCase().replace("jpg", "jpeg")}` : "image/png");
        return { buffer, mimeType };
      }
      if (d.status === "failed" || d.error) {
        console.error(`[discord] atlas generation failed: ${d.error || "unknown"}`);
        return null;
      }
    }
    console.error("[discord] atlas generation timed out");
    return null;
  } catch (err) {
    console.error("[discord] atlas generateImage failed", err);
    return null;
  }
}
