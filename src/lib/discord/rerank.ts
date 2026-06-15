import { z } from "zod";
import { chatJSON } from "@/lib/ai";
import type { ArchiveSearchHit } from "@/lib/discord/archive";

/**
 * LLM rerank pass over archive search results. Hybrid search (pgvector + keyword
 * RRF) is fast but ranks by statistical proximity — it doesn't *read* the hits.
 * Here we over-fetch, then ask the model to actually judge which segments answer
 * the question and keep the best `keep`. On any failure we fall back to the
 * original top-`keep`, so rerank can only help, never break a search.
 */
const RankSchema = z.object({ ids: z.array(z.number().int()).max(40) });

export const RERANK_SYSTEM_DEFAULT =
  "You rank archived group-chat snippets by how well each helps answer the user's question. Judge actual relevance, not keyword overlap. Return only indices.";

export async function rerankHits(
  query: string,
  hits: ArchiveSearchHit[],
  keep: number,
  model?: string,
  systemOverride?: string,
): Promise<ArchiveSearchHit[]> {
  if (hits.length <= keep) return hits;

  const list = hits
    .map((h, i) => `[${i}] (${h.channelName ?? h.channelId} · ${h.at.slice(0, 10)})\n${h.text.slice(0, 600)}`)
    .join("\n\n");

  try {
    const { ids } = await chatJSON({
      system: systemOverride?.trim() || RERANK_SYSTEM_DEFAULT,
      user: `QUESTION: ${query}\n\nSNIPPETS:\n${list}\n\nReturn JSON {"ids":[...]} listing the up-to-${keep} most relevant snippet indices, most relevant first. Omit snippets that don't help. If several snippets say essentially the same thing, keep only the best one — prefer a diverse set that covers different moments/angles.`,
      schema: RankSchema,
      model,
      maxTokens: 200,
    });

    const seen = new Set<number>();
    const picked = ids
      .filter((i) => i >= 0 && i < hits.length && !seen.has(i) && (seen.add(i), true))
      .slice(0, keep)
      .map((i) => hits[i]);
    return picked.length ? picked : hits.slice(0, keep);
  } catch (err) {
    console.error("[discord] rerank failed", err);
    return hits.slice(0, keep);
  }
}
