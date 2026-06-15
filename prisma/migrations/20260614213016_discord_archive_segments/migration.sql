-- Conversation-segment grain for semantic search.
--
-- Individual Discord messages are tiny ("lmao", "or Thursday June 12") and carry
-- almost no meaning alone — embedding them one-by-one gives weak recall. Meaning
-- lives in *bursts*: runs of consecutive messages with small inter-message gaps.
-- The archive data shows bursts are cleanly separable (median gap 79s, p90 ~8h),
-- so we segment on a ~30-min idle gap and embed the whole burst.
--
-- `messages` stays the immutable source of truth. Segments are a DERIVED layer,
-- rebuilt any time from messages by scripts/discord-embed.mjs — so changing the
-- gap rule, the model, or the embedded text is a cheap recompute, never a redo
-- of the (irreversible) Discord backfill. The old per-message message_embeddings
-- table is left in place but unused.

CREATE TABLE discord_archive.message_segments (
  id text PRIMARY KEY,                       -- = start message snowflake (stable per channel-burst)
  channel_id text NOT NULL REFERENCES discord_archive.channels(id) ON DELETE CASCADE,
  guild_id text,
  start_msg_id text NOT NULL,
  end_msg_id text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  message_count integer NOT NULL,
  content text NOT NULL DEFAULT '',
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
);

CREATE TABLE discord_archive.segment_embeddings (
  segment_id text PRIMARY KEY REFERENCES discord_archive.message_segments(id) ON DELETE CASCADE,
  model text NOT NULL,
  dimensions integer NOT NULL,
  embedding double precision[] NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX discord_archive_segments_channel_start_idx ON discord_archive.message_segments(channel_id, start_at DESC);
CREATE INDEX discord_archive_segments_start_idx ON discord_archive.message_segments(start_at DESC);
CREATE INDEX discord_archive_segments_content_tsv_idx ON discord_archive.message_segments USING GIN (content_tsv);
CREATE INDEX discord_archive_segment_embeddings_model_idx ON discord_archive.segment_embeddings(model);

CREATE TRIGGER discord_archive_segments_touch_updated_at
BEFORE UPDATE ON discord_archive.message_segments
FOR EACH ROW EXECUTE FUNCTION discord_archive.touch_updated_at();

CREATE TRIGGER discord_archive_segment_embeddings_touch_updated_at
BEFORE UPDATE ON discord_archive.segment_embeddings
FOR EACH ROW EXECUTE FUNCTION discord_archive.touch_updated_at();
