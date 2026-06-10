import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";

/**
 * Playful pet-name suggestions, proxied to Datamuse (no key needed).
 * Pools words from a few themed queries, filters to short single words,
 * and serves a random 8. The pool is cached in module memory for ~1h —
 * shuffling on each request keeps the button fun to mash anyway.
 * Degrades to a built-in list if Datamuse is down.
 */

const FALLBACK = [
  "Blobby",
  "Wiggles",
  "Pip",
  "Gremlin",
  "Noodle",
  "Mochi",
  "Sprout",
  "Bumble",
  "Pickle",
  "Waffle",
  "Squish",
  "Ziggy",
];

const QUERIES = [
  "ml=mischievous+creature",
  "ml=cute+blob",
  "rel_trg=wiggle",
  "sl=noodle",
];

const POOL_TTL_MS = 60 * 60_000;
let pool: { at: number; words: string[] } | null = null;

async function fetchPool(): Promise<string[]> {
  if (pool && Date.now() - pool.at < POOL_TTL_MS) return pool.words;

  const settled = await Promise.allSettled(
    QUERIES.map(async (q) => {
      const res = await fetch(`https://api.datamuse.com/words?${q}&max=30`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [] as string[];
      const raw = (await res.json()) as { word?: string }[];
      return raw.map((r) => r.word ?? "");
    })
  );

  const seen = new Set<string>();
  const words: string[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const w of result.value) {
      // Single playful-looking words only: letters, 3-12 chars.
      if (!/^[a-z]{3,12}$/i.test(w)) continue;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(key[0].toUpperCase() + key.slice(1));
    }
  }

  if (words.length >= 8) pool = { at: Date.now(), words };
  return words;
}

export const GET = apiHandler(async () => {
  await requireUser();

  let words: string[] = [];
  try {
    words = await fetchPool();
  } catch {
    // fall through to the built-in list
  }
  if (words.length < 8) words = FALLBACK;

  // Fisher–Yates on a copy, take 8.
  const deck = [...words];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return NextResponse.json({ names: deck.slice(0, 8) });
});
