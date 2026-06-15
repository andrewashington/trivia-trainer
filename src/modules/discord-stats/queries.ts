import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * Live aggregations over the immutable discord_archive (messages / segments /
 * channels). Read-only; everything keys off `author_id` (the Discord snowflake)
 * + `author_name` — the archive is the source of truth, and only ~5 of ~26
 * authors are linked to a UDM+ User (see identity.ts for the avatar enrichment).
 *
 * Time-of-day / day-of-week stats are bucketed in Mountain Time. `sent_at` is
 * stored UTC, so we convert with `AT TIME ZONE` before extracting parts.
 */
export const STATS_TZ = "America/Denver";

// Counts come back from Postgres as bigint unless we cast ::int in SQL; ratios
// are cast ::float8 so they arrive as JS numbers. Dates arrive as Date objects.

export type OverviewTotals = {
  messages: number;
  authors: number;
  channels: number;
  reactions: number;
  replies: number;
  segments: number;
  firstAt: Date | null;
  lastAt: Date | null;
  busiestDay: { date: string; count: number } | null;
};

async function overviewTotalsUncached(): Promise<OverviewTotals> {
  const [t] = await db.$queryRaw<
    {
      messages: number;
      authors: number;
      channels: number;
      reactions: number;
      replies: number;
      first_at: Date | null;
      last_at: Date | null;
    }[]
  >`
    SELECT
      count(*)::int AS messages,
      count(DISTINCT author_id)::int AS authors,
      count(DISTINCT channel_id)::int AS channels,
      coalesce(sum(reaction_count), 0)::int AS reactions,
      count(*) FILTER (WHERE reply_to_id IS NOT NULL)::int AS replies,
      min(sent_at) AS first_at,
      max(sent_at) AS last_at
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
  `;
  const [seg] = await db.$queryRaw<{ segments: number }[]>`
    SELECT count(*)::int AS segments FROM discord_archive.message_segments
  `;
  const [busy] = await db.$queryRaw<{ day: string; count: number }[]>`
    SELECT to_char((sent_at AT TIME ZONE ${STATS_TZ}::text)::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY 1 ORDER BY count DESC LIMIT 1
  `;
  return {
    messages: t?.messages ?? 0,
    authors: t?.authors ?? 0,
    channels: t?.channels ?? 0,
    reactions: t?.reactions ?? 0,
    replies: t?.replies ?? 0,
    segments: seg?.segments ?? 0,
    firstAt: t?.first_at ?? null,
    lastAt: t?.last_at ?? null,
    busiestDay: busy ? { date: busy.day, count: busy.count } : null,
  };
}

export const getOverviewTotals = unstable_cache(overviewTotalsUncached, ["dstats-overview"], {
  revalidate: 600,
});

export type LeaderRow = {
  authorId: string;
  authorName: string;
  messages: number;
  reactionsReceived: number;
  reactedMsgs: number;
  reactionRate: number; // reactions received per message
  avgLen: number;
  maxLen: number;
  repliesSent: number;
  channels: number;
  firstAt: Date | null;
  lastAt: Date | null;
};

async function leaderboardUncached(): Promise<LeaderRow[]> {
  const rows = await db.$queryRaw<
    {
      author_id: string;
      author_name: string;
      messages: number;
      reactions_received: number;
      reacted_msgs: number;
      avg_len: number | null;
      max_len: number | null;
      replies_sent: number;
      channels: number;
      first_at: Date | null;
      last_at: Date | null;
    }[]
  >`
    SELECT
      author_id,
      (array_agg(author_name ORDER BY sent_at DESC))[1] AS author_name,
      count(*)::int AS messages,
      coalesce(sum(reaction_count), 0)::int AS reactions_received,
      count(*) FILTER (WHERE reaction_count > 0)::int AS reacted_msgs,
      avg(length(content)) FILTER (WHERE content <> '')::float8 AS avg_len,
      coalesce(max(length(content)), 0)::int AS max_len,
      count(*) FILTER (WHERE reply_to_id IS NOT NULL)::int AS replies_sent,
      count(DISTINCT channel_id)::int AS channels,
      min(sent_at) AS first_at,
      max(sent_at) AS last_at
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY author_id
    HAVING count(*) >= 20
    ORDER BY messages DESC
  `;
  return rows.map((r) => ({
    authorId: r.author_id,
    authorName: r.author_name,
    messages: r.messages,
    reactionsReceived: r.reactions_received,
    reactedMsgs: r.reacted_msgs,
    reactionRate: r.messages ? r.reactions_received / r.messages : 0,
    avgLen: Math.round(r.avg_len ?? 0),
    maxLen: r.max_len ?? 0,
    repliesSent: r.replies_sent,
    channels: r.channels,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
}

export const getLeaderboard = unstable_cache(leaderboardUncached, ["dstats-leaderboard"], {
  revalidate: 600,
});

export type MonthPoint = { month: string; count: number };

async function activityByMonthUncached(): Promise<MonthPoint[]> {
  const rows = await db.$queryRaw<{ month: string; count: number }[]>`
    SELECT to_char(date_trunc('month', sent_at AT TIME ZONE ${STATS_TZ}::text), 'YYYY-MM') AS month,
           count(*)::int AS count
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY 1 ORDER BY 1 ASC
  `;
  return rows;
}

export const getActivityByMonth = unstable_cache(activityByMonthUncached, ["dstats-bymonth"], {
  revalidate: 600,
});

export type HeatCell = { dow: number; hour: number; count: number };

async function heatmapUncached(): Promise<HeatCell[]> {
  return db.$queryRaw<HeatCell[]>`
    SELECT
      extract(dow FROM (sent_at AT TIME ZONE ${STATS_TZ}::text))::int AS dow,
      extract(hour FROM (sent_at AT TIME ZONE ${STATS_TZ}::text))::int AS hour,
      count(*)::int AS count
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY 1, 2
  `;
}

export const getHeatmap = unstable_cache(heatmapUncached, ["dstats-heatmap"], { revalidate: 1800 });

export type YearRow = { year: number; count: number };

export async function getActivityByYear(): Promise<YearRow[]> {
  return db.$queryRaw<YearRow[]>`
    SELECT extract(year FROM (sent_at AT TIME ZONE ${STATS_TZ}::text))::int AS year, count(*)::int AS count
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY 1 ORDER BY 1 ASC
  `;
}

/** Night-owl ranking: each author's share of messages sent 0:00–5:59 MT. */
export async function getNightOwls(minMessages = 200): Promise<
  { authorId: string; authorName: string; lateShare: number; total: number }[]
> {
  const rows = await db.$queryRaw<
    { author_id: string; author_name: string; late: number; total: number }[]
  >`
    SELECT author_id,
      (array_agg(author_name ORDER BY sent_at DESC))[1] AS author_name,
      count(*) FILTER (WHERE extract(hour FROM (sent_at AT TIME ZONE ${STATS_TZ}::text)) < 6)::int AS late,
      count(*)::int AS total
    FROM discord_archive.messages
    WHERE deleted_at IS NULL AND is_bot = false
    GROUP BY author_id
    HAVING count(*) >= ${minMessages}
    ORDER BY (count(*) FILTER (WHERE extract(hour FROM (sent_at AT TIME ZONE ${STATS_TZ}::text)) < 6))::float8 / count(*) DESC
  `;
  return rows.map((r) => ({
    authorId: r.author_id,
    authorName: r.author_name,
    lateShare: r.total ? r.late / r.total : 0,
    total: r.total,
  }));
}

export type ChannelRow = {
  channelId: string;
  name: string | null;
  messages: number;
  authors: number;
  lastAt: Date | null;
  topAuthorId: string | null;
  topAuthorName: string | null;
};

async function channelLeaderboardUncached(): Promise<ChannelRow[]> {
  const rows = await db.$queryRaw<
    {
      channel_id: string;
      name: string | null;
      messages: number;
      authors: number;
      last_at: Date | null;
      top_author_id: string | null;
      top_author_name: string | null;
    }[]
  >`
    WITH per_channel AS (
      SELECT m.channel_id,
        count(*)::int AS messages,
        count(DISTINCT m.author_id)::int AS authors,
        max(m.sent_at) AS last_at
      FROM discord_archive.messages m
      WHERE m.deleted_at IS NULL AND m.is_bot = false
      GROUP BY m.channel_id
    ),
    top_author AS (
      SELECT DISTINCT ON (channel_id) channel_id, author_id, author_name, cnt
      FROM (
        SELECT channel_id, author_id,
          (array_agg(author_name ORDER BY sent_at DESC))[1] AS author_name,
          count(*)::int AS cnt
        FROM discord_archive.messages
        WHERE deleted_at IS NULL AND is_bot = false
        GROUP BY channel_id, author_id
      ) g
      ORDER BY channel_id, cnt DESC
    )
    SELECT pc.channel_id, c.name, pc.messages, pc.authors, pc.last_at,
           ta.author_id AS top_author_id, ta.author_name AS top_author_name
    FROM per_channel pc
    LEFT JOIN discord_archive.channels c ON c.id = pc.channel_id
    LEFT JOIN top_author ta ON ta.channel_id = pc.channel_id
    ORDER BY pc.messages DESC
  `;
  return rows.map((r) => ({
    channelId: r.channel_id,
    name: r.name,
    messages: r.messages,
    authors: r.authors,
    lastAt: r.last_at,
    topAuthorId: r.top_author_id,
    topAuthorName: r.top_author_name,
  }));
}

export const getChannelLeaderboard = unstable_cache(
  channelLeaderboardUncached,
  ["dstats-channels"],
  { revalidate: 600 },
);

export type FameMessage = {
  messageId: string;
  authorId: string;
  authorName: string;
  channelId: string;
  channelName: string | null;
  guildId: string | null;
  reactionCount: number;
  sentAt: Date;
  content: string;
};

export async function getHallOfFame(opts: { year?: number; limit?: number } = {}): Promise<
  FameMessage[]
> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const year = opts.year ?? null;
  const rows = await db.$queryRaw<
    {
      id: string;
      author_id: string;
      author_name: string;
      channel_id: string;
      channel_name: string | null;
      guild_id: string | null;
      reaction_count: number;
      sent_at: Date;
      content: string;
    }[]
  >`
    SELECT m.id, m.author_id, m.author_name, m.channel_id, c.name AS channel_name,
           m.guild_id, m.reaction_count, m.sent_at, m.content
    FROM discord_archive.messages m
    LEFT JOIN discord_archive.channels c ON c.id = m.channel_id
    WHERE m.deleted_at IS NULL AND m.is_bot = false AND m.reaction_count > 0
      AND (${year}::int IS NULL OR extract(year FROM (m.sent_at AT TIME ZONE ${STATS_TZ}::text)) = ${year})
    ORDER BY m.reaction_count DESC, m.sent_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    messageId: r.id,
    authorId: r.author_id,
    authorName: r.author_name,
    channelId: r.channel_id,
    channelName: r.channel_name,
    guildId: r.guild_id,
    reactionCount: r.reaction_count,
    sentAt: r.sent_at,
    content: r.content,
  }));
}

export type ReplyPair = {
  replierId: string;
  replierName: string;
  targetId: string;
  targetName: string;
  count: number;
};

async function powerPairsUncached(limit = 20): Promise<ReplyPair[]> {
  const rows = await db.$queryRaw<
    {
      replier_id: string;
      replier_name: string;
      target_id: string;
      target_name: string;
      n: number;
    }[]
  >`
    SELECT r.author_id AS replier_id, r.author_name AS replier_name,
           p.author_id AS target_id, p.author_name AS target_name,
           count(*)::int AS n
    FROM discord_archive.messages r
    JOIN discord_archive.messages p ON p.id = r.reply_to_id
    WHERE r.deleted_at IS NULL AND r.is_bot = false AND p.is_bot = false
      AND r.author_id <> p.author_id
    GROUP BY 1, 2, 3, 4
    ORDER BY n DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    replierId: r.replier_id,
    replierName: r.replier_name,
    targetId: r.target_id,
    targetName: r.target_name,
    count: r.n,
  }));
}

export const getPowerPairs = unstable_cache(
  () => powerPairsUncached(24),
  ["dstats-powerpairs"],
  { revalidate: 1800 },
);

export type RepliedToRow = { authorId: string; authorName: string; count: number };

/** Who gets replied to the most — the group's main characters. */
export const getRepliedToLeaders = unstable_cache(
  async (): Promise<RepliedToRow[]> => {
    const rows = await db.$queryRaw<{ author_id: string; author_name: string; n: number }[]>`
      SELECT p.author_id, (array_agg(p.author_name ORDER BY p.sent_at DESC))[1] AS author_name,
             count(*)::int AS n
      FROM discord_archive.messages r
      JOIN discord_archive.messages p ON p.id = r.reply_to_id
      WHERE r.deleted_at IS NULL AND r.is_bot = false AND p.is_bot = false
        AND r.author_id <> p.author_id
      GROUP BY p.author_id ORDER BY n DESC LIMIT 30
    `;
    return rows.map((r) => ({ authorId: r.author_id, authorName: r.author_name, count: r.n }));
  },
  ["dstats-repliedto"],
  { revalidate: 1800 },
);

export type SpikeDay = {
  date: string;
  count: number;
  z: number;
  channelName: string | null;
  snippet: string;
};

/** Anomalous activity days (z-score over daily volume) + that day's top burst. */
export async function getAnomalySpikes(limit = 8): Promise<SpikeDay[]> {
  const days = await db.$queryRaw<{ date: string; count: number; z: number }[]>`
    WITH daily AS (
      SELECT (sent_at AT TIME ZONE ${STATS_TZ}::text)::date AS d, count(*)::int AS count
      FROM discord_archive.messages
      WHERE deleted_at IS NULL AND is_bot = false
      GROUP BY 1
    ),
    stats AS (SELECT avg(count) AS mean, stddev_pop(count) AS sd FROM daily)
    SELECT to_char(d, 'YYYY-MM-DD') AS date, count,
           ((count - stats.mean) / nullif(stats.sd, 0))::float8 AS z
    FROM daily, stats
    ORDER BY count DESC
    LIMIT ${limit}
  `;
  // For each spike day, grab the single densest conversation burst — that burst
  // *is* "what happened here", no LLM required.
  const out: SpikeDay[] = [];
  for (const day of days) {
    const [seg] = await db.$queryRaw<{ name: string | null; content: string }[]>`
      SELECT c.name, s.content
      FROM discord_archive.message_segments s
      LEFT JOIN discord_archive.channels c ON c.id = s.channel_id
      WHERE (s.start_at AT TIME ZONE ${STATS_TZ}::text)::date = ${day.date}::date
      ORDER BY s.message_count DESC
      LIMIT 1
    `;
    out.push({
      date: day.date,
      count: day.count,
      z: day.z,
      channelName: seg?.name ?? null,
      snippet: (seg?.content ?? "").replace(/\s+/g, " ").slice(0, 240),
    });
  }
  return out;
}

export type TimeMachineHit = {
  year: number;
  date: string;
  channelName: string | null;
  text: string;
  messageCount: number;
};

/** "On this day, N years ago…" — densest bursts matching today's MM-DD (MT). */
export async function getTimeMachine(limit = 4): Promise<TimeMachineHit[]> {
  const rows = await db.$queryRaw<
    { year: number; date: string; name: string | null; content: string; message_count: number }[]
  >`
    SELECT DISTINCT ON (extract(year FROM (s.start_at AT TIME ZONE ${STATS_TZ}::text)))
      extract(year FROM (s.start_at AT TIME ZONE ${STATS_TZ}::text))::int AS year,
      to_char((s.start_at AT TIME ZONE ${STATS_TZ}::text)::date, 'YYYY-MM-DD') AS date,
      c.name, s.content, s.message_count
    FROM discord_archive.message_segments s
    LEFT JOIN discord_archive.channels c ON c.id = s.channel_id
    WHERE to_char(s.start_at AT TIME ZONE ${STATS_TZ}::text, 'MM-DD')
        = to_char((now() AT TIME ZONE ${STATS_TZ}::text), 'MM-DD')
    ORDER BY extract(year FROM (s.start_at AT TIME ZONE ${STATS_TZ}::text)) DESC, s.message_count DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    year: r.year,
    date: r.date,
    channelName: r.name,
    text: r.content,
    messageCount: r.message_count,
  }));
}

// ---- Member profile (author-scoped; uses the (author_id, sent_at) index) ----

export type MemberProfile = {
  authorId: string;
  authorName: string;
  busiestChannel: { channelId: string; name: string | null; count: number } | null;
  busiestHour: number | null;
  byYear: YearRow[];
  repliesTo: ReplyPair[];
  repliedBy: ReplyPair[];
  longest: { content: string; sentAt: Date; channelName: string | null } | null;
  hallOfFame: FameMessage[];
};

export async function getMemberProfile(authorId: string): Promise<MemberProfile | null> {
  const [name] = await db.$queryRaw<{ author_name: string }[]>`
    SELECT (array_agg(author_name ORDER BY sent_at DESC))[1] AS author_name
    FROM discord_archive.messages
    WHERE author_id = ${authorId} AND deleted_at IS NULL
  `;
  if (!name?.author_name) return null;

  const [busiestChannel] = await db.$queryRaw<
    { channel_id: string; name: string | null; count: number }[]
  >`
    SELECT m.channel_id, c.name, count(*)::int AS count
    FROM discord_archive.messages m
    LEFT JOIN discord_archive.channels c ON c.id = m.channel_id
    WHERE m.author_id = ${authorId} AND m.deleted_at IS NULL AND m.is_bot = false
    GROUP BY m.channel_id, c.name ORDER BY count DESC LIMIT 1
  `;

  const [hour] = await db.$queryRaw<{ hour: number }[]>`
    SELECT extract(hour FROM (sent_at AT TIME ZONE ${STATS_TZ}::text))::int AS hour
    FROM discord_archive.messages
    WHERE author_id = ${authorId} AND deleted_at IS NULL AND is_bot = false
    GROUP BY 1 ORDER BY count(*) DESC LIMIT 1
  `;

  const byYear = await db.$queryRaw<YearRow[]>`
    SELECT extract(year FROM (sent_at AT TIME ZONE ${STATS_TZ}::text))::int AS year, count(*)::int AS count
    FROM discord_archive.messages
    WHERE author_id = ${authorId} AND deleted_at IS NULL AND is_bot = false
    GROUP BY 1 ORDER BY 1 ASC
  `;

  const repliesTo = await db.$queryRaw<
    { replier_id: string; replier_name: string; target_id: string; target_name: string; n: number }[]
  >`
    SELECT r.author_id AS replier_id, r.author_name AS replier_name,
           p.author_id AS target_id, p.author_name AS target_name, count(*)::int AS n
    FROM discord_archive.messages r
    JOIN discord_archive.messages p ON p.id = r.reply_to_id
    WHERE r.author_id = ${authorId} AND r.deleted_at IS NULL AND p.author_id <> r.author_id
    GROUP BY 1, 2, 3, 4 ORDER BY n DESC LIMIT 6
  `;

  const repliedBy = await db.$queryRaw<
    { replier_id: string; replier_name: string; target_id: string; target_name: string; n: number }[]
  >`
    SELECT r.author_id AS replier_id, r.author_name AS replier_name,
           p.author_id AS target_id, p.author_name AS target_name, count(*)::int AS n
    FROM discord_archive.messages r
    JOIN discord_archive.messages p ON p.id = r.reply_to_id
    WHERE p.author_id = ${authorId} AND r.deleted_at IS NULL AND r.author_id <> p.author_id
    GROUP BY 1, 2, 3, 4 ORDER BY n DESC LIMIT 6
  `;

  const [longest] = await db.$queryRaw<{ content: string; sent_at: Date; name: string | null }[]>`
    SELECT m.content, m.sent_at, c.name
    FROM discord_archive.messages m
    LEFT JOIN discord_archive.channels c ON c.id = m.channel_id
    WHERE m.author_id = ${authorId} AND m.deleted_at IS NULL AND m.is_bot = false
    ORDER BY length(m.content) DESC LIMIT 1
  `;

  const fame = await db.$queryRaw<
    {
      id: string;
      channel_id: string;
      channel_name: string | null;
      guild_id: string | null;
      reaction_count: number;
      sent_at: Date;
      content: string;
    }[]
  >`
    SELECT m.id, m.channel_id, c.name AS channel_name, m.guild_id, m.reaction_count, m.sent_at, m.content
    FROM discord_archive.messages m
    LEFT JOIN discord_archive.channels c ON c.id = m.channel_id
    WHERE m.author_id = ${authorId} AND m.deleted_at IS NULL AND m.reaction_count > 0
    ORDER BY m.reaction_count DESC, m.sent_at DESC LIMIT 5
  `;

  const mapPair = (r: {
    replier_id: string;
    replier_name: string;
    target_id: string;
    target_name: string;
    n: number;
  }): ReplyPair => ({
    replierId: r.replier_id,
    replierName: r.replier_name,
    targetId: r.target_id,
    targetName: r.target_name,
    count: r.n,
  });

  return {
    authorId,
    authorName: name.author_name,
    busiestChannel: busiestChannel
      ? { channelId: busiestChannel.channel_id, name: busiestChannel.name, count: busiestChannel.count }
      : null,
    busiestHour: hour?.hour ?? null,
    byYear,
    repliesTo: repliesTo.map(mapPair),
    repliedBy: repliedBy.map(mapPair),
    longest: longest
      ? { content: longest.content, sentAt: longest.sent_at, channelName: longest.name }
      : null,
    hallOfFame: fame.map((r) => ({
      messageId: r.id,
      authorId,
      authorName: name.author_name,
      channelId: r.channel_id,
      channelName: r.channel_name,
      guildId: r.guild_id,
      reactionCount: r.reaction_count,
      sentAt: r.sent_at,
      content: r.content,
    })),
  };
}

/** Per-channel detail for the channel drill-down page. */
export async function getChannelDetail(channelId: string): Promise<{
  channel: { id: string; name: string | null };
  byMonth: MonthPoint[];
  topAuthors: { authorId: string; authorName: string; count: number }[];
  fame: FameMessage[];
} | null> {
  const [channel] = await db.$queryRaw<{ id: string; name: string | null }[]>`
    SELECT id, name FROM discord_archive.channels WHERE id = ${channelId}
  `;
  if (!channel) return null;

  const byMonth = await db.$queryRaw<MonthPoint[]>`
    SELECT to_char(date_trunc('month', sent_at AT TIME ZONE ${STATS_TZ}::text), 'YYYY-MM') AS month,
           count(*)::int AS count
    FROM discord_archive.messages
    WHERE channel_id = ${channelId} AND deleted_at IS NULL AND is_bot = false
    GROUP BY 1 ORDER BY 1 ASC
  `;

  const topAuthors = await db.$queryRaw<{ author_id: string; author_name: string; count: number }[]>`
    SELECT author_id,
      (array_agg(author_name ORDER BY sent_at DESC))[1] AS author_name,
      count(*)::int AS count
    FROM discord_archive.messages
    WHERE channel_id = ${channelId} AND deleted_at IS NULL AND is_bot = false
    GROUP BY author_id ORDER BY count DESC LIMIT 10
  `;

  const fameRows = await db.$queryRaw<
    {
      id: string;
      author_id: string;
      author_name: string;
      guild_id: string | null;
      reaction_count: number;
      sent_at: Date;
      content: string;
    }[]
  >`
    SELECT id, author_id, author_name, guild_id, reaction_count, sent_at, content
    FROM discord_archive.messages
    WHERE channel_id = ${channelId} AND deleted_at IS NULL AND is_bot = false AND reaction_count > 0
    ORDER BY reaction_count DESC, sent_at DESC LIMIT 6
  `;

  return {
    channel,
    byMonth,
    topAuthors: topAuthors.map((r) => ({
      authorId: r.author_id,
      authorName: r.author_name,
      count: r.count,
    })),
    fame: fameRows.map((r) => ({
      messageId: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      channelId,
      channelName: channel.name,
      guildId: r.guild_id,
      reactionCount: r.reaction_count,
      sentAt: r.sent_at,
      content: r.content,
    })),
  };
}
