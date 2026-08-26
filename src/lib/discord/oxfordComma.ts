/**
 * Oxford (serial) comma fixer.
 *
 * Inserts a comma before the coordinating conjunction in a list of three or
 * more items when that comma is missing — and leaves everything else alone.
 *
 *   "apples, oranges and bananas" → "apples, oranges, and bananas"
 *   "red, white, and blue"        → unchanged (already correct)
 *   "cats and dogs"               → unchanged (only two items)
 *
 * Mentions, custom emoji, URLs, and code spans are frozen first so we never
 * rewrite inside them.
 */

const TOKEN_RE =
  /```[\s\S]*?```|`[^`]+`|<a?:\w+:\d+>|<#\d+>|<@!?\d+>|<@&\d+>|https?:\/\/\S+/g;

/**
 * 1–5 word noun-ish chunk. Internal dots are allowed (`U.S.A`) but a trailing
 * period is not — otherwise "bananas." eats the stop and `\b` fails after it.
 */
const WORD = String.raw`[\w][\w'-]*(?:\.(?:[\w][\w'-]*))*`;
const ITEM = String.raw`${WORD}(?:[ \t]+${WORD}){0,4}`;
const CONJ = String.raw`and\/or|and|or|&`;
const CONJ_WORD = /\b(?:and\/or|and|or|&)\b/i;

/**
 * First word of a match that is almost never the start of a serial list —
 * subordinators, vocatives, interjections, and bare verbs that introduce
 * "Let's eat, grandma and grandpa" / "Thanks, Bob and Alice".
 */
const BLOCKED_FIRST = new Set([
  "if",
  "when",
  "while",
  "although",
  "because",
  "since",
  "after",
  "before",
  "unless",
  "until",
  "though",
  "whereas",
  "once",
  "however",
  "thanks",
  "thank",
  "hey",
  "hi",
  "hello",
  "please",
  "sorry",
  "yes",
  "no",
  "well",
  "oh",
  "wow",
  "ok",
  "okay",
  "yo",
  "sup",
  "nah",
  "yep",
  "yeah",
  "let",
  "lets",
  "let's",
  "wait",
  "look",
  "see",
  "listen",
  "come",
  "go",
  "eat",
  "stop",
]);

const CLAUSE_START = /^(i|i'm|i'll|i've|i'd|you|we|they|he|she|it)\b/i;

function protect(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const next = text.replace(TOKEN_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `@@OX${i}@@`;
  });
  return { text: next, tokens };
}

function restore(text: string, tokens: string[]): string {
  return text.replace(/@@OX(\d+)@@/g, (_, n) => tokens[Number(n)] ?? "");
}

function firstWord(item: string): string {
  return (item.trim().split(/[ \t]+/)[0] ?? "").replace(/['’.]+$/g, "").toLowerCase();
}

function wordCount(item: string): number {
  return item.trim().split(/[ \t]+/).filter(Boolean).length;
}

/** `1,000 and 2,000` is thousands grouping, not a 3-item list. */
function looksLikeThousands(items: string[]): boolean {
  return items.some((item, i) => {
    if (i === 0) return false;
    return /^\d{3}$/.test(item.trim()) && /^\d{1,3}$/.test(items[i - 1].trim());
  });
}

/**
 * Parallel items (all nouns, or all short clauses) are a real list.
 * "Mom, I need milk and eggs" is not — one vocative, one clause, one noun.
 */
function isParallel(items: string[]): boolean {
  const counts = items.map(wordCount);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const clauseish = items.filter((item) => CLAUSE_START.test(item.trim()));
  if (clauseish.length > 0 && clauseish.length < items.length) return false;
  if (max <= 2) return true;
  return max - min <= 2;
}

function shouldOxford(items: string[]): boolean {
  if (items.length < 3) return false;
  const head = items[0] ?? "";
  if (BLOCKED_FIRST.has(firstWord(head))) return false;
  if (BLOCKED_FIRST.has(firstWord(head.split(/[ \t]+/).pop() ?? ""))) return false;
  // "mac and cheese, soup and salad" is two compounds, not a 3-item list.
  if (CONJ_WORD.test(head)) return false;
  if (looksLikeThousands(items)) return false;
  if (!isParallel(items)) return false;
  return true;
}

function precededByConjunction(text: string, index: number): boolean {
  return /(?:^|[\s([{"'])(?:and\/or|and|or|&)\s+$/i.test(text.slice(0, index));
}

function applyList(first: string, middle: string, conj: string, last: string): string | null {
  const head = first.trim();
  const rest = [...middle.split(/,[ \t]+/).filter(Boolean), last].map((s) => s.trim());
  // Subordinators / vocatives ("If you're ready, …", "Thanks, …") are not lists
  // and must not be salvaged by taking the last word as a list head.
  if (BLOCKED_FIRST.has(firstWord(head))) return null;
  if (shouldOxford([head, ...rest])) return `${first}${middle}, ${conj} ${last}`;

  // Leftmost match often swallows a lead-in ("I invited Tom, Dick and Harry").
  const words = head.split(/[ \t]+/);
  const maxTake = Math.min(3, words.length - 1);
  for (let take = 1; take <= maxTake; take++) {
    const head = words.slice(-take).join(" ");
    const leadIn = words.slice(0, -take).join(" ");
    if (CONJ_WORD.test(leadIn.split(/[ \t]+/).pop() ?? "")) continue;
    if (!shouldOxford([head, ...rest])) continue;
    return `${leadIn} ${head}${middle}, ${conj} ${last}`;
  }
  return null;
}

/**
 * Add a missing Oxford comma before `and` / `or` / `and/or` / `&` in serial
 * lists. Returns the input unchanged when there is no proper use for one.
 */
export function addOxfordCommas(text: string): string {
  if (!text.trim()) return text;

  const { text: frozen, tokens } = protect(text);
  const re = new RegExp(
    String.raw`\b(${ITEM})((?:,[ \t]+${ITEM})+)[ \t]+(${CONJ})[ \t]+(${ITEM})\b`,
    "gi"
  );

  let out = frozen;
  for (let i = 0; i < 5; i++) {
    const next = out.replace(re, (match, first: string, middle: string, conj: string, last: string, offset: number) => {
      if (precededByConjunction(out, offset)) return match;
      return applyList(first, middle, conj, last) ?? match;
    });
    if (next === out) break;
    out = next;
  }

  return restore(out, tokens).slice(0, 2000);
}
