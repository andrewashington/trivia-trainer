import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";

/**
 * Movie/TV search, proxied to TMDB so the API key never reaches the
 * client. Accepts either auth style in TMDB_API_KEY: a v4 read access
 * token (the long JWT — sent as a Bearer header) or a v3 key (sent as
 * the api_key query param). With no key set, returns enabled:false and
 * the UI hides the search affordance — manual entry keeps working.
 */

const query = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(["movie", "tv"]),
});

type TmdbResult = { id: number; title: string; year: number | null; posterPath: string | null };

// Tiny in-memory cache: repeated keystrokes and shared searches are
// common, TMDB rate limits are not infinite. Fine per-instance.
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; results: TmdbResult[] }>();

export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const { q, type } = query.parse({
    q: params.get("q") ?? "",
    type: params.get("type") ?? "movie",
  });

  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ enabled: false, results: [] });

  const cacheKey = `${type}:${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ enabled: true, results: hit.results });
  }

  const url = new URL(`https://api.themoviedb.org/3/search/${type}`);
  url.searchParams.set("query", q);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", "1");
  const isV4Token = key.includes("."); // v4 read tokens are JWTs
  if (!isV4Token) url.searchParams.set("api_key", key);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/json",
      ...(isV4Token ? { Authorization: `Bearer ${key}` } : {}),
    },
  });
  // Search is sugar on top of manual entry — degrade to "no results"
  // rather than surfacing an error state in the form.
  if (!res.ok) return NextResponse.json({ enabled: true, results: [] });

  const raw = (await res.json()) as {
    results?: {
      id: number;
      title?: string; // movies
      name?: string; // tv
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
    }[];
  };

  const results: TmdbResult[] = (raw.results ?? []).slice(0, 8).map((r) => {
    const date = r.release_date || r.first_air_date || "";
    const year = Number(date.slice(0, 4));
    return {
      id: r.id,
      title: (type === "movie" ? r.title : r.name) ?? "Untitled",
      year: Number.isFinite(year) && year > 0 ? year : null,
      posterPath: r.poster_path ?? null,
    };
  });

  cache.set(cacheKey, { at: Date.now(), results });
  // Opportunistic sweep so dead queries don't pile up forever.
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
  }
  return NextResponse.json({ enabled: true, results });
});
