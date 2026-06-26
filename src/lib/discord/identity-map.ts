// Canonical author identity — runtime side (display relabel + search scoping).
//
// The curated map lives in ./canonical-authors.json (a single source of truth
// shared with scripts/discord-clean.mjs, which bakes the same names into segment
// content at build time). Keep edits in the JSON, not here.
//
// Two runtime jobs:
//  1. relabelAuthors(text) — rewrite "handle:" line prefixes to canonical names
//     for any segment whose content hasn't been rebuilt yet (display-only, an
//     idempotent safety net once the content rebuild has baked names in).
//  2. resolveScopeAuthorId(name) — map a name/alias a user typed ("what did
//     Chandler say") to the Discord snowflake, so search_messages can scope by
//     authorId — immune to whatever handle is baked in the archived text.
import canonicalData from "./canonical-authors.json";

type CanonicalAuthor = { authorId: string; canonical: string; aliases: string[] };

const CANONICAL_AUTHORS: CanonicalAuthor[] = canonicalData.authors;

// Lowercased label (canonical + every alias) -> canonical name, for the line
// relabel. Including the canonical itself makes the rewrite idempotent on
// already-canonical content.
const LABEL_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const a of CANONICAL_AUTHORS) {
    for (const label of [a.canonical, ...a.aliases]) m.set(label.toLowerCase(), a.canonical);
  }
  return m;
})();

// Lowercased label (canonical + every alias) -> Discord author snowflake, for
// scoping a search to one person by whatever name the asker used.
const LABEL_TO_AUTHOR_ID: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const a of CANONICAL_AUTHORS) {
    for (const label of [a.canonical, ...a.aliases]) m.set(label.toLowerCase(), a.authorId);
  }
  return m;
})();

/** The roster of {authorId, canonical, aliases} — for exposing scoping hints to the agent. */
export function canonicalRoster(): CanonicalAuthor[] {
  return CANONICAL_AUTHORS;
}

// Discord author snowflake -> canonical name, for labeling live messages/turns
// by the person's real name instead of whatever handle Discord hands back.
const AUTHOR_ID_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const a of CANONICAL_AUTHORS) m.set(a.authorId, a.canonical);
  return m;
})();

/** Canonical name for a Discord author snowflake, or null if unmapped. */
export function canonicalForAuthorId(authorId: string | null | undefined): string | null {
  if (!authorId) return null;
  return AUTHOR_ID_TO_CANONICAL.get(authorId) ?? null;
}

/** Resolve a name/alias the user typed to a Discord author snowflake, or null. */
export function resolveScopeAuthorId(name: string): string | null {
  return LABEL_TO_AUTHOR_ID.get(name.trim().toLowerCase()) ?? null;
}

/**
 * Rewrite the leading "handle:" on each line of stitched segment text to the
 * canonical name. Segment content is one message per line, formatted as
 * "author_name: text" (see scripts/discord-clean.mjs), and author names never
 * contain ": ", so the first ": " on a line always ends the author handle —
 * making a prefix rewrite exact, never touching message bodies. Stitch markers
 * ("— — —", "=====") and any line without ": " pass through untouched.
 */
export function relabelAuthors(text: string): string {
  if (!LABEL_TO_CANONICAL.size) return text;
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(": ");
      if (idx === -1) return line;
      const canonical = LABEL_TO_CANONICAL.get(line.slice(0, idx).toLowerCase());
      return canonical ? `${canonical}: ${line.slice(idx + 2)}` : line;
    })
    .join("\n");
}
