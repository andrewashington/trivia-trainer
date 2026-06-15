/**
 * Image generation via OpenRouter (chat/completions with image modality).
 * Used ONLY by the bot's spontaneous-post feature to drop an occasional
 * AI-generated image into the photobook. Reuses OPENROUTER_API_KEY; the model
 * is OPENROUTER_IMAGE_MODEL (default a fast image model).
 */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

export function imageModel(): string {
  return process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
}

export type GeneratedImage = { buffer: Buffer; mimeType: string };

/** Generate one image from a prompt. Returns null on any failure (caller no-ops). */
export async function generateImage(prompt: string): Promise<GeneratedImage | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const referer = (process.env.AUTH_URL ?? "https://udm-plus.up.railway.app").replace(/\/$/, "");

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "UDM+ spontaneous",
      },
      body: JSON.stringify({
        model: imageModel(),
        modalities: ["image", "text"],
        messages: [{ role: "user", content: prompt.slice(0, 2000) }],
      }),
    });
    if (!res.ok) {
      console.error(`[discord] image gen ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) return null;
    return dataUrlToImage(url);
  } catch (err) {
    console.error("[discord] image gen failed", err);
    return null;
  }
}

/** Parse a `data:image/png;base64,...` URL into bytes + mime type. */
function dataUrlToImage(url: string): GeneratedImage | null {
  const m = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
}
