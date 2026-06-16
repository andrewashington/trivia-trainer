// Canonical author labels for archive search results.
//
// Segment `content` bakes the *archived* Discord handle per line (e.g.
// "chan5538: ...") at segment-build time, and those vectors are frozen — we do
// NOT re-embed to fix names. Instead we relabel at the DISPLAY/return layer:
// when a search hit's stitched text is handed to the assistant, we rewrite each
// line's leading "handle:" to the canonical name the group actually uses.
//
// Keyed by Discord author snowflake (`author_id`), which is unambiguous. The
// `aliases` are the archived `author_name` strings that appear verbatim in
// segment content (one per author today — see the identity audit). Add a row
// here to relabel; leave an author out to keep their archived handle as-is.
//
// Owner-curated. To change a label, edit `canonical`. To map a handle whose
// real name we don't know yet, add the row with the name once known.

type CanonicalAuthor = {
  authorId: string;
  canonical: string; // what the model should see, e.g. a real first name
  aliases: string[]; // archived author_name(s) as they appear in segment text
};

// Real first names confirmed by the owner + remembered facts (DiscordMemory).
// Authors not listed (Brock C and the low-traffic long tail) keep their archived
// handle. Note the group has TWO Brocks: Ralph (the primary Brock) and "borck",
// labeled "Brock 2" so the model never conflates them.
const CANONICAL_AUTHORS: CanonicalAuthor[] = [
  { authorId: "174673533656367105", canonical: "Patrick", aliases: ["VIII"] }, // Schwang Doodler / VIII
  { authorId: "637518756381196288", canonical: "Brock", aliases: ["Ralph"] },
  { authorId: "388760699414904832", canonical: "Scott", aliases: ["ScottTheAmazing"] },
  { authorId: "571012264639987715", canonical: "Chandler", aliases: ["chan5538"] }, // nebu
  { authorId: "184048471127490560", canonical: "Andre", aliases: ["puddlelift"] },
  { authorId: "610961711352119307", canonical: "Skylar", aliases: ["Snake Dr"] },
  { authorId: "642253150543413250", canonical: "Adam", aliases: ["CasperTheG"] },
  { authorId: "273656222962417665", canonical: "Antonio", aliases: ["Tonesmz"] },
  { authorId: "689313647507668993", canonical: "Jacob", aliases: ["wake"] },
  { authorId: "689995014532497421", canonical: "Brock 2", aliases: ["borck"] }, // second Brock — distinct from Ralph
  { authorId: "281906820824563712", canonical: "Dan", aliases: ["Munky"] }, // Dan Bailey
  { authorId: "382050389022867457", canonical: "Geoff", aliases: ["HugoStiglitz"] },
  { authorId: "469525258806755329", canonical: "Jesse", aliases: ["Wim"] },
];

// Lowercased archived-handle -> canonical name. Built once at module load.
const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const a of CANONICAL_AUTHORS) {
    for (const alias of a.aliases) m.set(alias.toLowerCase(), a.canonical);
  }
  return m;
})();

/**
 * Rewrite the leading "handle:" on each line of stitched segment text to the
 * canonical name. Segment content is one message per line, formatted as
 * "author_name: text" (see scripts/discord-embed.mjs), and author names never
 * contain ": ", so the first ": " on a line always ends the author handle —
 * making a prefix rewrite exact, never touching message bodies. Stitch markers
 * ("— — —", "=====") and any line without ": " pass through untouched.
 */
export function relabelAuthors(text: string): string {
  if (!ALIAS_TO_CANONICAL.size) return text;
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(": ");
      if (idx === -1) return line;
      const canonical = ALIAS_TO_CANONICAL.get(line.slice(0, idx).toLowerCase());
      return canonical ? `${canonical}: ${line.slice(idx + 2)}` : line;
    })
    .join("\n");
}
