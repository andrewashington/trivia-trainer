/**
 * Build-time content cleaner for archive segments. Turns a raw Discord message
 * into a clean, RAG-legible "Canonical: text" line:
 *   - author handle  -> canonical name (shared canonical-authors.json)
 *   - <@id> / <@!id> -> @CanonicalName   (resolved from the archive)
 *   - <#id>          -> #channel-name
 *   - <@&roleid>     -> dropped (noise)
 *   - <:emoji:id>    -> :emoji:
 *   - tenor/giphy/.gif links -> [gif]
 *   - other URLs     -> [link: domain]   (drop tracking path/query)
 *   - attachment/embed-only message -> [image]
 *
 * Used by scripts/discord-embed.mjs at segment-rebuild time. Pure functions +
 * one DB-backed resolver builder; no embedding here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadCanonical(root = process.cwd()) {
  const data = JSON.parse(readFileSync(join(root, "src/lib/discord/canonical-authors.json"), "utf8"));
  return data.authors;
}

/**
 * Build the id->name resolvers from the archive: every author's latest handle,
 * every channel's name, with curated canonical names overlaid (canonical wins).
 * Returns { authorName(id), mention(id), channel(id) } lookups.
 */
export async function buildResolvers(db, root = process.cwd()) {
  const canonical = loadCanonical(root);
  const canonicalById = new Map(canonical.map((a) => [a.authorId, a.canonical]));

  const authorRows = await db.$queryRaw`
    SELECT DISTINCT ON (author_id) author_id, author_name
    FROM discord_archive.messages
    ORDER BY author_id, sent_at DESC
  `;
  const nameById = new Map(authorRows.map((r) => [r.author_id, r.author_name]));
  for (const [id, name] of canonicalById) nameById.set(id, name); // canonical overrides archived

  const channelRows = await db.$queryRaw`SELECT id, name FROM discord_archive.channels`;
  const channelById = new Map(channelRows.map((r) => [r.id, r.name]));

  return {
    // The label to print for a message's own author.
    authorName: (id, fallback) => nameById.get(id) ?? fallback ?? "someone",
    // The name for an @mention; unknown ids (mentioned but never spoke) -> "someone".
    mention: (id) => nameById.get(id) ?? "someone",
    channel: (id) => channelById.get(id) ?? "channel",
  };
}

function domainOf(url) {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  if (!m) return null;
  return m[1].replace(/^www\./i, "");
}

function isGif(url) {
  const d = domainOf(url); // already strips a leading www.
  if (d && /(^|\.)(tenor|giphy)\.com$/i.test(d)) return true;
  return /\.gif(\?|$)/i.test(url);
}

/** Clean one message's content text (no author prefix). Returns "" if it reduces to nothing. */
export function cleanContent(raw, resolvers) {
  let s = raw ?? "";
  // Mentions: <@id> / <@!id> -> @Name
  s = s.replace(/<@!?(\d+)>/g, (_, id) => `@${resolvers.mention(id)}`);
  // Channel mentions: <#id> -> #channel-name
  s = s.replace(/<#(\d+)>/g, (_, id) => `#${resolvers.channel(id)}`);
  // Role mentions: <@&id> -> drop (noise)
  s = s.replace(/<@&\d+>/g, "");
  // Custom emoji: <:name:id> / <a:name:id> -> :name:
  s = s.replace(/<a?:(\w+):\d+>/g, ":$1:");
  // URLs: gifs -> [gif]; everything else -> [link: domain]
  s = s.replace(/https?:\/\/\S+/gi, (url) => {
    if (isGif(url)) return "[gif]";
    const d = domainOf(url);
    return d ? `[link: ${d}]` : "[link]";
  });
  // Collapse whitespace.
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Format one message row into a clean segment line, or null to skip it.
 * `m` needs: author_id, author_name, content, attachments (jsonb|null), has_embed.
 */
export function cleanLine(m, resolvers, perMsgChars = 280) {
  const label = resolvers.authorName(m.author_id, m.author_name);
  let body = cleanContent(m.content, resolvers);
  if (!body) {
    const hasAttachment = Array.isArray(m.attachments) ? m.attachments.length > 0 : !!m.attachments;
    if (hasAttachment) body = "[image]";
    else if (m.has_embed) body = "[link]";
    else return null; // truly empty — nothing to index
  }
  if (body.length > perMsgChars) body = body.slice(0, perMsgChars);
  return `${label}: ${body}`;
}
