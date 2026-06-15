// Discord archive embeddings — runtime (query-time) side.
//
// Embeddings now go through OpenRouter (OPENROUTER_API_KEY, the same key the
// assistant uses), which exposes an OpenAI-compatible /embeddings endpoint.
// Model ids must be provider-prefixed (e.g. "openai/text-embedding-3-small").
// The batch backfill lives in scripts/discord-embed.mjs and must stay in sync
// with the endpoint/model here.

const OPENROUTER_EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export function embeddingModel(): string {
  return process.env.DISCORD_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export async function embedTexts(texts: string[], model = embeddingModel()): Promise<number[][]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  if (!texts.length) return [];

  const referer = (process.env.AUTH_URL ?? "https://udm-plus.up.railway.app").replace(/\/$/, "");
  const res = await fetch(OPENROUTER_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "UDM+",
    },
    body: JSON.stringify({
      model,
      input: texts.map((t) => t.slice(0, 8000)),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter embeddings ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  return (json.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

export async function embedQuery(query: string): Promise<number[] | null> {
  if (process.env.DISCORD_EMBEDDINGS_ENABLED !== "true" || !process.env.OPENROUTER_API_KEY) return null;
  const [embedding] = await embedTexts([query]);
  return embedding ?? null;
}
