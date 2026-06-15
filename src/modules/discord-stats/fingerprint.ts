import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/**
 * Verbal fingerprint: the words an author uses *disproportionately* vs the whole
 * group. Built from Postgres full-text stats (`ts_stat` over the english
 * `content_tsv`), so lexemes are already stemmed and standard stopwords stripped.
 *
 * Score = (author's uses-per-1k-msgs) / (group's uses-per-1k-msgs). A high score
 * means "this person says this way more than everyone else" — their tic. We floor
 * on both author count (a real habit, not a one-off) and global count (a real
 * group word, not a typo) so the list is signature, not noise.
 */
export type SignatureWord = {
  word: string;
  authorUses: number;
  ratio: number; // how many× more often than the group average
};

type StatRow = { word: string; nentry: number };

const JUNK = /^(?:[a-z]{1,2}|\d+|.*\d.*|.*[._/].*|https?|www|com|gif|png|jpg|jpeg|amp)$/i;

function clean(rows: StatRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const w = r.word;
    if (!w || JUNK.test(w)) continue;
    m.set(w, r.nentry);
  }
  return m;
}

/** Group-wide lexeme frequencies (cached daily — the one heavy scan). */
const getGlobalWordStats = unstable_cache(
  async (): Promise<{ totalMsgs: number; words: StatRow[] }> => {
    const [{ total }] = await db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM discord_archive.messages
      WHERE deleted_at IS NULL AND is_bot = false
    `;
    const words = await db.$queryRaw<StatRow[]>`
      SELECT word, nentry::int AS nentry
      FROM ts_stat(${"SELECT content_tsv FROM discord_archive.messages WHERE deleted_at IS NULL AND is_bot = false"})
      WHERE nentry >= 25
    `;
    return { totalMsgs: total ?? 0, words };
  },
  ["dstats-global-words"],
  { revalidate: 86_400 },
);

export async function getFingerprint(authorId: string, limit = 16): Promise<SignatureWord[]> {
  if (!/^\d+$/.test(authorId)) return []; // Discord snowflakes are numeric — guards the ts_stat literal

  const [authorMeta] = await db.$queryRaw<{ msgs: number }[]>`
    SELECT count(*)::int AS msgs FROM discord_archive.messages
    WHERE author_id = ${authorId} AND deleted_at IS NULL AND is_bot = false
  `;
  const authorMsgs = authorMeta?.msgs ?? 0;
  if (authorMsgs < 100) return [];

  const authorRows = await db.$queryRaw<StatRow[]>`
    SELECT word, nentry::int AS nentry
    FROM ts_stat(${`SELECT content_tsv FROM discord_archive.messages WHERE author_id = '${authorId}' AND deleted_at IS NULL AND is_bot = false`})
    WHERE nentry >= 8
  `;

  const { totalMsgs, words: globalRows } = await getGlobalWordStats();
  if (!totalMsgs) return [];
  const authorWords = clean(authorRows);
  const globalWords = clean(globalRows);

  const scored: SignatureWord[] = [];
  for (const [word, uses] of authorWords) {
    const globalUses = globalWords.get(word);
    if (!globalUses) continue; // not a real group word
    const authorRate = uses / authorMsgs;
    const groupRate = globalUses / totalMsgs;
    const ratio = authorRate / groupRate;
    if (ratio < 1.5) continue; // must actually over-index
    scored.push({ word, authorUses: uses, ratio });
  }
  scored.sort((a, b) => b.ratio - a.ratio);
  return scored.slice(0, limit);
}
