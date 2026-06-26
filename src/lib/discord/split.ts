/**
 * Split a reply into Discord-safe chunks.
 *
 * Discord hard-caps a message at 2000 characters and silently rejects anything
 * longer — the old call sites just `.slice(0, 2000)`, which lops a long answer
 * off mid-word. This splits on the nicest available boundary (paragraph → line
 * → sentence → space) so a multi-part reply reads as if it were always meant to
 * be several messages. A `maxParts` cap keeps a runaway generation from spamming
 * the channel; the final part is hard-trimmed with an ellipsis if we hit it.
 */
const DISCORD_LIMIT = 2000;

export function splitForDiscord(
  text: string,
  opts: { limit?: number; maxParts?: number } = {}
): string[] {
  const limit = opts.limit ?? DISCORD_LIMIT;
  const maxParts = opts.maxParts ?? 3;
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const parts: string[] = [];
  let rest = clean;
  while (rest.length > limit && parts.length < maxParts - 1) {
    const cut = findCut(rest, limit);
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length) {
    parts.push(rest.length > limit ? rest.slice(0, limit - 1).trimEnd() + "…" : rest);
  }
  return parts;
}

/** Best break point at/under `limit` — prefer a real boundary over a hard cut. */
function findCut(s: string, limit: number): number {
  const window = s.slice(0, limit);
  const floor = limit * 0.5; // don't accept a boundary so early it makes a tiny chunk
  const para = window.lastIndexOf("\n\n");
  if (para > floor) return para + 2;
  const nl = window.lastIndexOf("\n");
  if (nl > floor) return nl + 1;
  const sentence = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? ")
  );
  if (sentence > floor) return sentence + 2;
  const space = window.lastIndexOf(" ");
  if (space > floor) return space + 1;
  return limit;
}
