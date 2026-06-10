import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { searchTeams, type SportsTeam } from "@/lib/sportsdb";

/**
 * Team search for sports-mode claims, proxied to TheSportsDB. Filtered
 * to the five major leagues. Cached in-memory like the TMDB search.
 */

const query = z.object({ q: z.string().trim().min(2).max(80) });

const CACHE_TTL_MS = 60 * 60_000; // rosters don't change mid-day
const cache = new Map<string, { at: number; teams: SportsTeam[] }>();

export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const { q } = query.parse({ q: new URL(req.url).searchParams.get("q") ?? "" });

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ teams: hit.teams });
  }

  // Search is sugar — degrade to "no results" rather than an error state.
  let teams: SportsTeam[] = [];
  try {
    teams = await searchTeams(q);
  } catch {
    return NextResponse.json({ teams: [] });
  }

  cache.set(cacheKey, { at: Date.now(), teams });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
  }
  return NextResponse.json({ teams });
});
