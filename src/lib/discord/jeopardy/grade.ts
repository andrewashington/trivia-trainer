/**
 * Jeopardy answer grading — deterministic and fast (no LLM). Snappy beats
 * perfect here: a typo or a dropped article should still score, but the bar
 * tightens for short answers so "e" doesn't match "Pi".
 *
 * Pipeline:
 *   1. normalize both sides (case, HTML, accents, punctuation, "what is…",
 *      leading articles, & → and);
 *   2. expand the canonical response into accepted alternates — parentheticals
 *      are optional ("(Mark) Twain" ⇒ "mark twain" | "twain"), "X or Y" and
 *      "X/Y" split, quoted titles lose their quotes;
 *   3. accept on exact match, last-name-only for multi-word answers, the
 *      answer containing every word of the alternate (light padding only), or
 *      a Damerau-Levenshtein distance within a length-scaled budget.
 */

const QUESTION_LEAD =
  /^(?:(?:what|who|where|when|which|why|how)\s*(?:is|are|was|were|s|re|'s|'re|does|did|do)?|it\s*s|its|it\s+is|that\s*s|thats|i\s+think|maybe|um+|uh+)\s+/i;
const ARTICLE_LEAD = /^(?:a|an|the)\s+/;

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Lowercase, de-accent, drop punctuation, drop question phrasing + leading article. */
export function normalizeAnswer(raw: string): string {
  let s = stripAccents(stripHtml(raw)).toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/[’‘`]/g, "'");
  s = s.replace(/[“”]/g, '"');
  s = s.replace(/\bst\.\s/g, "saint ");
  s = s.replace(/\bmt\.\s/g, "mount ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(QUESTION_LEAD, "");
  s = s.replace(QUESTION_LEAD, ""); // "um, what is…"
  s = s.replace(ARTICLE_LEAD, "");
  return s.trim();
}

/** Every string a player may say to be marked correct for `response`. */
export function acceptedForms(response: string): string[] {
  const base = stripHtml(response).replace(/["“”]/g, "");
  const variants = new Set<string>();

  // Parentheticals: optional. "(Mark) Twain" → "Mark Twain", "Twain".
  // "Clemens (Mark Twain)" → "Clemens Mark Twain", "Clemens", "Mark Twain".
  const parenParts: string[] = [];
  const withoutParens = base.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    parenParts.push(inner);
    return " ";
  });
  variants.add(base.replace(/[()]/g, " "));
  variants.add(withoutParens);
  for (const p of parenParts) variants.add(p);

  // "X or Y", "X/Y" — either side is fine.
  for (const v of [...variants]) {
    for (const piece of v.split(/\s+or\s+|\s*\/\s*/i)) variants.add(piece);
  }

  const out = new Set<string>();
  for (const v of variants) {
    const n = normalizeAnswer(v);
    if (n) out.add(n);
  }
  return [...out];
}

/** Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m];
}

/** Typo budget by length: short answers must be exact, long ones forgive more. */
function budget(len: number): number {
  if (len < 4) return 0;
  if (len <= 6) return 1;
  if (len <= 11) return 2;
  return 3;
}

const STOP = new Set(["of", "the", "a", "an", "and", "in", "on", "de", "la", "le"]);

function significantTokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

/** Numbers and years must be exact — "1493" is not close to "1492". */
const isNumeric = (s: string) => /^\d+$/.test(s);

export type Verdict = { correct: boolean; matched?: string };

/** Is `answer` close enough to the canonical `response`? */
export function gradeAnswer(answer: string, response: string): Verdict {
  const given = normalizeAnswer(answer);
  if (!given) return { correct: false };
  const forms = acceptedForms(response);
  const givenTokens = significantTokens(given);

  for (const form of forms) {
    if (given === form) return { correct: true, matched: form };
    if (isNumeric(form) || isNumeric(given)) continue;

    const formTokens = significantTokens(form);

    // Surname-only for people / short-title tails: "twain" for "mark twain".
    if (formTokens.length >= 2) {
      const last = formTokens[formTokens.length - 1];
      if (last.length >= 4 && (given === last || editDistance(given, last) <= budget(last.length) - 1)) {
        return { correct: true, matched: form };
      }
    }

    // Every significant word of the form appears in the answer, with at most
    // one extra word of padding ("mississippi river" ok, "paris rome london" not).
    if (formTokens.length > 0 && givenTokens.length <= formTokens.length + 1) {
      const all = formTokens.every((t) =>
        givenTokens.some((g) => g === t || (t.length >= 4 && editDistance(g, t) <= budget(t.length) - 1))
      );
      if (all) return { correct: true, matched: form };
    }

    // Whole-string fuzzy match.
    const dist = editDistance(given, form);
    if (dist <= budget(form.length)) return { correct: true, matched: form };
  }
  return { correct: false };
}
