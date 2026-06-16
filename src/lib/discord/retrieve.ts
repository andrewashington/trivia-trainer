// Multi-query retrieval — the single entry point the assistant tool, the probe,
// and the eval all call. Turns ONE user query into several search angles so a
// single search_messages call casts wide, then runs the hybrid (semantic +
// keyword) search over all of them and fuses the results.
//
// Why: chat queries ("who likes pizza") are phrased nothing like the chat that
// answers them ("lucali is so worth it"), and one phrasing misses what people
// said differently. We expand into:
//   - the original query (keyword + semantic)
//   - up to 2 paraphrases with different vocabulary (keyword + semantic)
//   - 1 HyDE hypothetical: an imagined answer-shaped message, embedded so it
//     lands near real answers in vector space (semantic only — it's fabricated,
//     so it would only pollute the keyword leg)
// All legs fuse through the existing RRF in searchArchiveMessages.
import { z } from "zod";
import { chatJSON, aiConfigured } from "@/lib/ai";
import { embedTexts } from "@/lib/discord/embeddings";
import {
  searchArchiveMessages,
  embeddingsEnabled,
  type ArchiveSearchHit,
  type QueryVariant,
} from "@/lib/discord/archive";

export const EXPAND_SYSTEM_DEFAULT =
  "You expand a search query for a tight-knit friend group's Discord archive (years of casual chat, in-jokes, plans, hot takes). Given one query, produce alternate SEARCH phrasings that use the different words the group might have actually typed (synonyms, slang, the concrete instead of the abstract), plus ONE hypothetical chat message that would be a believable answer to the query — written like someone in the group casually saying it, not like a search query. Keep everything short. Don't invent specific names, dates, or facts; vary wording, not truth.";

const ExpandSchema = z.object({
  paraphrases: z.array(z.string()).max(4),
  hypothetical: z.string(),
});

export type ExpandedQuery = { variants: QueryVariant[]; expanded: boolean };

/**
 * Expand a query into search variants. Always returns at least the original
 * (keyword + semantic). On any failure, degrades to just the original — so
 * expansion can only help, never break a search.
 */
export async function expandQuery(
  query: string,
  opts?: { model?: string; system?: string },
): Promise<ExpandedQuery> {
  const original: QueryVariant = { text: query, keyword: true };
  if (!aiConfigured()) return { variants: [original], expanded: false };
  try {
    const { paraphrases, hypothetical } = await chatJSON({
      system: opts?.system?.trim() || EXPAND_SYSTEM_DEFAULT,
      user: `QUERY: ${query}\n\nReturn JSON {"paraphrases":[up to 2 alternate search phrasings],"hypothetical":"one short imagined chat message that would answer this"}.`,
      schema: ExpandSchema,
      model: opts?.model,
      maxTokens: 250,
    });
    const variants: QueryVariant[] = [original];
    for (const p of paraphrases.slice(0, 2)) {
      if (p.trim()) variants.push({ text: p.trim(), keyword: true });
    }
    if (hypothetical.trim()) variants.push({ text: hypothetical.trim(), keyword: false }); // HyDE: semantic only
    return { variants, expanded: variants.length > 1 };
  } catch (err) {
    console.error("[discord] expandQuery failed", err);
    return { variants: [original], expanded: false };
  }
}

/**
 * Retrieve archive segments for a query: expand → embed all variants in one
 * batch → hybrid multi-query search. The one function the tool/probe/eval share.
 */
export async function retrieve(opts: {
  query: string;
  channelId?: string;
  authorId?: string;
  after?: Date;
  before?: Date;
  limit?: number;
  expand?: boolean; // default true
  semantic?: boolean; // default true — gates the embedding legs
  expandModel?: string;
  expandSystem?: string;
}): Promise<{ hits: ArchiveSearchHit[]; variants: QueryVariant[]; expanded: boolean }> {
  const query = opts.query.trim();
  if (!query) return { hits: [], variants: [], expanded: false };

  const { variants, expanded } =
    opts.expand === false
      ? { variants: [{ text: query, keyword: true }] as QueryVariant[], expanded: false }
      : await expandQuery(query, { model: opts.expandModel, system: opts.expandSystem });

  // Embed every variant's text in ONE batch call, then attach by index.
  if (opts.semantic !== false && embeddingsEnabled()) {
    try {
      const vecs = await embedTexts(variants.map((v) => v.text));
      variants.forEach((v, i) => {
        if (vecs[i]?.length) v.embedding = vecs[i];
      });
    } catch (err) {
      console.error("[discord] retrieve embed failed", err); // degrade to keyword-only
    }
  }

  const hits = await searchArchiveMessages({
    variants,
    channelId: opts.channelId,
    authorId: opts.authorId,
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  });
  return { hits, variants, expanded };
}
