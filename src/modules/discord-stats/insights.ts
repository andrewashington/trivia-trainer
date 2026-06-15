import { db } from "@/lib/db";

/**
 * Readers for the precomputed "insights" layer (scripts/discord-insights.mjs →
 * discord_archive.{segment_layout,topic_cluster,author_vector,author_dossier,
 * lexicon_term,insights_meta}). These are caches: before the first rebuild they
 * are simply empty, so every reader degrades to an empty/null result rather than
 * throwing — the pages render "not built yet" states instead of 500-ing.
 */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[discord-stats] insights read failed", err);
    return fallback;
  }
}

export type InsightsMeta = {
  status: string;
  detail: string;
  stats: Record<string, unknown> | null;
  startedAt: Date | null;
  lastBuiltAt: Date | null;
};

export async function getInsightsMeta(): Promise<InsightsMeta | null> {
  return safe(async () => {
    const [m] = await db.$queryRaw<
      {
        status: string;
        detail: string;
        stats: Record<string, unknown> | null;
        started_at: Date | null;
        last_built_at: Date | null;
      }[]
    >`SELECT status, detail, stats, started_at, last_built_at FROM discord_archive.insights_meta WHERE id = 1`;
    if (!m) return null;
    return {
      status: m.status,
      detail: m.detail,
      stats: m.stats,
      startedAt: m.started_at,
      lastBuiltAt: m.last_built_at,
    };
  }, null);
}

export type GalaxyPoint = {
  id: string;
  x: number;
  y: number;
  c: number; // cluster id
  e: number; // era (year)
  at: string;
  ch: string | null;
  s: string; // short snippet
};

export async function getGalaxyPoints(limit = 9000): Promise<GalaxyPoint[]> {
  return safe(async () => {
    const rows = await db.$queryRaw<
      {
        id: string;
        x: number;
        y: number;
        c: number;
        e: number | null;
        at: Date;
        ch: string | null;
        content: string;
      }[]
    >`
      SELECT l.segment_id AS id, l.x, l.y, l.cluster_id AS c, l.era AS e,
             s.start_at AS at, ch.name AS ch, s.content
      FROM discord_archive.segment_layout l
      JOIN discord_archive.message_segments s ON s.id = l.segment_id
      LEFT JOIN discord_archive.channels ch ON ch.id = s.channel_id
      WHERE l.x IS NOT NULL AND l.y IS NOT NULL
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      c: r.c,
      e: r.e ?? 0,
      at: r.at.toISOString().slice(0, 10),
      ch: r.ch,
      s: r.content.replace(/\s+/g, " ").slice(0, 90),
    }));
  }, []);
}

export type TopicCluster = {
  id: number;
  label: string;
  summary: string;
  size: number;
  keywords: string[];
  color: string | null;
};

export async function getTopicClusters(): Promise<TopicCluster[]> {
  return safe(async () => {
    const rows = await db.$queryRaw<TopicCluster[]>`
      SELECT id, label, summary, size, keywords, color
      FROM discord_archive.topic_cluster ORDER BY size DESC
    `;
    return rows;
  }, []);
}

export type TrendPoint = { clusterId: number; month: string; count: number };

export async function getTopicTrends(): Promise<TrendPoint[]> {
  return safe(async () => {
    return db.$queryRaw<TrendPoint[]>`
      SELECT l.cluster_id AS "clusterId",
             to_char(date_trunc('month', s.start_at), 'YYYY-MM') AS month,
             count(*)::int AS count
      FROM discord_archive.segment_layout l
      JOIN discord_archive.message_segments s ON s.id = l.segment_id
      GROUP BY 1, 2 ORDER BY 2 ASC
    `;
  }, []);
}

export type Dossier = { authorId: string; authorName: string; body: string; createdAt: Date };

export async function getDossier(authorId: string): Promise<Dossier | null> {
  return safe(async () => {
    const [d] = await db.$queryRaw<
      { author_id: string; author_name: string; body: string; created_at: Date }[]
    >`SELECT author_id, author_name, body, created_at FROM discord_archive.author_dossier WHERE author_id = ${authorId}`;
    if (!d) return null;
    return { authorId: d.author_id, authorName: d.author_name, body: d.body, createdAt: d.created_at };
  }, null);
}

export type LexiconTerm = { term: string; definition: string; example: string; uses: number };

export async function getLexicon(): Promise<LexiconTerm[]> {
  return safe(
    async () =>
      db.$queryRaw<LexiconTerm[]>`
        SELECT term, definition, example, uses FROM discord_archive.lexicon_term ORDER BY uses DESC
      `,
    [],
  );
}

export type Soulmate = { authorId: string; authorName: string; similarity: number };

export async function getSoulmates(authorId: string, limit = 5): Promise<Soulmate[]> {
  return safe(async () => {
    const rows = await db.$queryRaw<{ author_id: string; author_name: string; sim: number }[]>`
      SELECT a2.author_id, a2.author_name, (1 - (a1.embedding <=> a2.embedding))::float8 AS sim
      FROM discord_archive.author_vector a1
      JOIN discord_archive.author_vector a2 ON a2.author_id <> a1.author_id
      WHERE a1.author_id = ${authorId}
      ORDER BY a1.embedding <=> a2.embedding ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ authorId: r.author_id, authorName: r.author_name, similarity: r.sim }));
  }, []);
}

export type SoulmateTop = {
  authorId: string;
  authorName: string;
  matchId: string;
  matchName: string;
  similarity: number;
};

/** Each author's single closest "thinks-alike" match (for the soulmates board). */
export async function getSoulmateBoard(): Promise<SoulmateTop[]> {
  return safe(async () => {
    const rows = await db.$queryRaw<
      { id1: string; n1: string; id2: string; n2: string; sim: number }[]
    >`
      WITH pairs AS (
        SELECT a1.author_id AS id1, a1.author_name AS n1,
               a2.author_id AS id2, a2.author_name AS n2,
               (1 - (a1.embedding <=> a2.embedding))::float8 AS sim
        FROM discord_archive.author_vector a1
        JOIN discord_archive.author_vector a2 ON a2.author_id <> a1.author_id
      )
      SELECT DISTINCT ON (id1) id1, n1, id2, n2, sim
      FROM pairs ORDER BY id1, sim DESC
    `;
    return rows.map((r) => ({
      authorId: r.id1,
      authorName: r.n1,
      matchId: r.id2,
      matchName: r.n2,
      similarity: r.sim,
    }));
  }, []);
}
