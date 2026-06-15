const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export function embeddingModel(): string {
  return process.env.DISCORD_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export async function embedTexts(texts: string[], model = embeddingModel()): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  if (!texts.length) return [];

  const res = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: texts.map((t) => t.slice(0, 8000)),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  return (json.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

export async function embedQuery(query: string): Promise<number[] | null> {
  if (process.env.DISCORD_EMBEDDINGS_ENABLED !== "true" || !process.env.OPENAI_API_KEY) return null;
  const [embedding] = await embedTexts([query]);
  return embedding ?? null;
}
