-- Discord Stats "insights" layer: precomputed, derived artifacts that power the
-- Discord Stats hub's marquee features. Everything here is REBUILDABLE from the
-- immutable discord_archive.messages/segments + segment_embeddings, so these are
-- pure caches — safe to TRUNCATE and recompute (scripts/discord-insights.mjs).
-- All additive; no existing table is touched.

-- The conversation star-map. One row per segment: every segment gets a
-- cluster_id (nearest topic centroid, for full-volume topic trends), but only a
-- projected sample carries (x, y) coordinates (the points actually drawn in the
-- galaxy). era is the calendar year of the segment, for the color-by-era toggle.
CREATE TABLE discord_archive.segment_layout (
  segment_id text PRIMARY KEY REFERENCES discord_archive.message_segments(id) ON DELETE CASCADE,
  cluster_id integer NOT NULL,
  x real,
  y real,
  era integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discord_archive_segment_layout_cluster_idx ON discord_archive.segment_layout(cluster_id);
CREATE INDEX discord_archive_segment_layout_xy_idx ON discord_archive.segment_layout(x) WHERE x IS NOT NULL;

-- LLM-labeled topic clusters (the islands in the galaxy + the streamgraph keys).
CREATE TABLE discord_archive.topic_cluster (
  id integer PRIMARY KEY,
  label text NOT NULL,
  summary text NOT NULL DEFAULT '',
  size integer NOT NULL DEFAULT 0,
  keywords text[] NOT NULL DEFAULT '{}',
  color text,
  cx real,
  cy real,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-author "thought centroid" (mean of all their segment embeddings), stored
-- as a pgvector so Semantic Soulmates is a cheap cosine over ~26 rows.
CREATE TABLE discord_archive.author_vector (
  author_id text PRIMARY KEY,
  author_name text NOT NULL,
  segment_count integer NOT NULL DEFAULT 0,
  embedding vector(1536) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- LLM-authored personality dossier per author (markdown), rebuilt on demand.
CREATE TABLE discord_archive.author_dossier (
  author_id text PRIMARY KEY,
  author_name text NOT NULL,
  body text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The group's auto-mined inside-joke dictionary (LLM-defined, with an example).
CREATE TABLE discord_archive.lexicon_term (
  term text PRIMARY KEY,
  definition text NOT NULL,
  example text NOT NULL DEFAULT '',
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Single-row build bookkeeping (status banner + "last rebuilt" on the admin tab).
CREATE TABLE discord_archive.insights_meta (
  id integer PRIMARY KEY DEFAULT 1,
  status text NOT NULL DEFAULT 'idle',
  detail text NOT NULL DEFAULT '',
  stats jsonb,
  started_at timestamptz,
  last_built_at timestamptz,
  CONSTRAINT insights_meta_singleton CHECK (id = 1)
);
INSERT INTO discord_archive.insights_meta (id, status) VALUES (1, 'idle')
  ON CONFLICT (id) DO NOTHING;

-- Speed up the live aggregations the hub leans on (hall-of-fame ordering and the
-- reply graph), since these scan messages by columns that weren't indexed.
CREATE INDEX discord_archive_messages_reaction_idx
  ON discord_archive.messages(reaction_count DESC) WHERE deleted_at IS NULL;
CREATE INDEX discord_archive_messages_reply_to_idx
  ON discord_archive.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
