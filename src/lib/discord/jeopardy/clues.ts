import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Clue selection. Values are NOT the aired dollar amounts (pre-2001 boards
 * were $100–$500): a category's five clues are ranked by aired value and
 * re-priced 200/400/600/800/1000 (×2 for Double Jeopardy). That keeps every
 * board internally consistent whatever season it came from.
 */

export type GameClue = {
  id: number;
  category: string;
  value: number;
  clue: string;
  response: string;
};

export type GameCategory = { name: string; clues: GameClue[] };

const STEP = 200;

type RawClue = { id: number; category: string; value: number; clue: string; response: string };

function priceRank(clues: RawClue[], multiplier: number): GameClue[] {
  const sorted = [...clues].sort((a, b) => a.value - b.value || a.id - b.id);
  return sorted.map((c, i) => ({
    id: c.id,
    category: c.category,
    value: (i + 1) * STEP * multiplier,
    clue: c.clue,
    response: c.response,
  }));
}

/** Skip categories that only make sense on TV (audio/video/"seen here"). */
function isPlayable(c: { clue: string; category: string }): boolean {
  const t = `${c.category} ${c.clue}`;
  return !/seen here|heard here|shown here|pictured|\[audio|\[video|this clip|this photo/i.test(t);
}

/** Uniformly random clue rows (by id), the seed for category/board picks. */
async function sampleClues(n: number, round?: 1 | 2) {
  return db.$queryRaw<{ airDate: Date; round: number; category: string }[]>`
    SELECT c."airDate", c."round", c."category"
    FROM jeopardy_clues c
    JOIN (
      SELECT (floor(random() * (SELECT max("id") FROM jeopardy_clues)) + 1)::int AS id
      FROM generate_series(1, ${n})
    ) s ON s.id = c."id"
    WHERE ${round ? Prisma.sql`c."round" = ${round}` : Prisma.sql`c."round" IN (1, 2)`}
  `;
}

/** `count` random complete categories (5 playable clues each), priced for a single round. */
export async function randomCategories(count: number, excludeIds: number[] = []): Promise<GameCategory[]> {
  const seeds = await sampleClues(count * 8);
  const out: GameCategory[] = [];
  const seen = new Set<string>();
  for (const g of seeds) {
    if (out.length >= count) break;
    const key = `${g.airDate.toISOString()}|${g.round}|${g.category}`;
    if (seen.has(key) || out.some((o) => o.name === g.category)) continue;
    seen.add(key);
    const rows = await db.jeopardyClue.findMany({
      where: { airDate: g.airDate, round: g.round, category: g.category },
      select: { id: true, category: true, value: true, clue: true, response: true },
    });
    if (rows.length !== 5 || !rows.every(isPlayable)) continue;
    if (rows.some((r) => excludeIds.includes(r.id))) continue;
    out.push({ name: g.category, clues: priceRank(rows, 1) });
  }
  return out;
}

/**
 * A full 6×5 board from a single aired round (so the categories were designed
 * to sit next to each other). Falls back to six random categories when no
 * complete round is found in the sampled window.
 */
export async function randomBoard(round: 1 | 2): Promise<GameCategory[]> {
  const multiplier = round === 2 ? 2 : 1;
  const seeds = await sampleClues(12, round);
  const episodes = [...new Map(seeds.map((s) => [s.airDate.toISOString(), s])).values()].filter(
    (s) => s.airDate >= new Date("1990-01-01")
  );
  for (const ep of episodes) {
    const rows = await db.jeopardyClue.findMany({
      where: { airDate: ep.airDate, round },
      select: { id: true, category: true, value: true, clue: true, response: true },
      orderBy: { id: "asc" },
    });
    if (rows.length !== 30 || !rows.every(isPlayable)) continue;
    const byCat = new Map<string, RawClue[]>();
    for (const r of rows) (byCat.get(r.category) ?? byCat.set(r.category, []).get(r.category)!).push(r);
    if (byCat.size !== 6 || [...byCat.values()].some((c) => c.length !== 5)) continue;
    return [...byCat.entries()].map(([name, clues]) => ({ name, clues: priceRank(clues, multiplier) }));
  }
  const fallback = await randomCategories(6);
  return fallback.map((c) => ({
    name: c.name,
    clues: c.clues.map((cl) => ({ ...cl, value: cl.value * multiplier })),
  }));
}

export async function clueBankSize(): Promise<number> {
  return db.jeopardyClue.count();
}
