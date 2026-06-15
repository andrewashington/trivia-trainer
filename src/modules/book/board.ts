import type { BookMarket } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * What the board actually shows. The DB now holds thousands of markets across
 * every topic, but a naive "top N by volume" would just resurface the politics
 * wall — Polymarket's volume is dominated by it. So we pull the whole active
 * pool and interleave it round-robin across categories: the result alternates
 * sports / tech / culture / politics / …, and every category gets fair shelf
 * space regardless of how it ranks on raw volume.
 */

function interleaveByCategory<T extends { category: string | null; volume24hr: number | null }>(
  rows: T[],
  limit: number
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.category ?? "Other";
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  // `rows` arrives volume-sorted, so each category keeps its hottest first.
  // Lead each pass with the category whose top market is hottest; "Other" last.
  const order = [...groups.keys()].sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return (groups.get(b)![0]?.volume24hr ?? 0) - (groups.get(a)![0]?.volume24hr ?? 0);
  });

  const out: T[] = [];
  for (let pass = 0; out.length < limit; pass += 1) {
    let progressed = false;
    for (const key of order) {
      const row = groups.get(key)![pass];
      if (row) {
        out.push(row);
        progressed = true;
        if (out.length >= limit) break;
      }
    }
    if (!progressed) break;
  }
  return out;
}

/** A category-balanced slice of the live board. */
export async function loadDiverseMarkets(limit = 600): Promise<BookMarket[]> {
  const pool = await db.bookMarket.findMany({
    where: { active: true, closed: false },
    orderBy: [{ volume24hr: "desc" }, { volume: "desc" }, { liquidity: "desc" }],
    take: 4000,
  });
  return interleaveByCategory(pool, limit);
}
