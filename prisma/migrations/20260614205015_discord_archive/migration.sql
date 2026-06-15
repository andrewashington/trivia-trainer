CREATE SCHEMA IF NOT EXISTS discord_archive;

CREATE TABLE discord_archive.channels (
  id text PRIMARY KEY,
  guild_id text,
  name text,
  kind text,
  archived boolean NOT NULL DEFAULT false,
  last_backfill_id text,
  backfill_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discord_archive.messages (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES discord_archive.channels(id) ON DELETE CASCADE,
  guild_id text,
  author_id text NOT NULL,
  author_name text NOT NULL,
  user_id text,
  is_bot boolean NOT NULL DEFAULT false,
  content text NOT NULL DEFAULT '',
  reply_to_id text,
  attachments jsonb,
  has_embed boolean NOT NULL DEFAULT false,
  reaction_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
);

CREATE TABLE discord_archive.reactions (
  message_id text NOT NULL REFERENCES discord_archive.messages(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  author_id text NOT NULL,
  user_id text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, emoji, author_id)
);

CREATE TABLE discord_archive.message_embeddings (
  message_id text PRIMARY KEY REFERENCES discord_archive.messages(id) ON DELETE CASCADE,
  model text NOT NULL,
  dimensions integer NOT NULL,
  embedding double precision[] NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX discord_archive_channels_guild_id_idx ON discord_archive.channels(guild_id);
CREATE INDEX discord_archive_messages_channel_sent_idx ON discord_archive.messages(channel_id, sent_at DESC);
CREATE INDEX discord_archive_messages_author_sent_idx ON discord_archive.messages(author_id, sent_at DESC);
CREATE INDEX discord_archive_messages_user_sent_idx ON discord_archive.messages(user_id, sent_at DESC);
CREATE INDEX discord_archive_messages_sent_idx ON discord_archive.messages(sent_at DESC);
CREATE INDEX discord_archive_messages_deleted_idx ON discord_archive.messages(deleted_at);
CREATE INDEX discord_archive_messages_content_tsv_idx ON discord_archive.messages USING GIN (content_tsv);
CREATE INDEX discord_archive_reactions_message_idx ON discord_archive.reactions(message_id);
CREATE INDEX discord_archive_reactions_author_idx ON discord_archive.reactions(author_id);
CREATE INDEX discord_archive_embeddings_model_idx ON discord_archive.message_embeddings(model);
CREATE INDEX discord_archive_embeddings_content_hash_idx ON discord_archive.message_embeddings(content_hash);

CREATE OR REPLACE FUNCTION discord_archive.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discord_archive_channels_touch_updated_at
BEFORE UPDATE ON discord_archive.channels
FOR EACH ROW EXECUTE FUNCTION discord_archive.touch_updated_at();

CREATE TRIGGER discord_archive_messages_touch_updated_at
BEFORE UPDATE ON discord_archive.messages
FOR EACH ROW EXECUTE FUNCTION discord_archive.touch_updated_at();

CREATE TRIGGER discord_archive_embeddings_touch_updated_at
BEFORE UPDATE ON discord_archive.message_embeddings
FOR EACH ROW EXECUTE FUNCTION discord_archive.touch_updated_at();

CREATE OR REPLACE FUNCTION discord_archive.cosine_similarity(a double precision[], b double precision[])
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN sqrt(sum(x.val * x.val)) = 0 OR sqrt(sum(y.val * y.val)) = 0 THEN 0
    ELSE sum(x.val * y.val) / (sqrt(sum(x.val * x.val)) * sqrt(sum(y.val * y.val)))
  END
  FROM unnest(a) WITH ORDINALITY AS x(val, i)
  JOIN unnest(b) WITH ORDINALITY AS y(val, i) USING (i);
$$;
