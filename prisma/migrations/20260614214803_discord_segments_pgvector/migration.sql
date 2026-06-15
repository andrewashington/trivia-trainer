-- Move segment embeddings onto pgvector (native `vector` type) instead of the
-- stopgap double precision[] + hand-rolled cosine_similarity() scan.
--
-- pgvector is available on the managed instance (vector 0.8.2). Native storage
-- is half the size (float4 vs float8), gives us the `<=>` cosine-distance
-- operator, and lets an HNSW index keep search sub-linear as the archive grows.
-- We committed to openai/text-embedding-3-small (1536 dims); a different-dim
-- model later is a fresh migration (and a cheap re-embed).
--
-- The embedding column is dropped and re-added (not cast) — vectors are the
-- cheap, disposable layer, so the backfill just re-runs into the new column.

CREATE EXTENSION IF NOT EXISTS vector;

-- Clear the partial float8[] backfill — re-embedded fresh into the vector column.
TRUNCATE discord_archive.segment_embeddings;

ALTER TABLE discord_archive.segment_embeddings DROP COLUMN embedding;
ALTER TABLE discord_archive.segment_embeddings ADD COLUMN embedding vector(1536) NOT NULL;

-- HNSW over cosine distance — the index `<=>` queries can use.
CREATE INDEX discord_archive_segment_embeddings_hnsw_idx
  ON discord_archive.segment_embeddings
  USING hnsw (embedding vector_cosine_ops);
