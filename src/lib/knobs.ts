// server-side only (imports db via appConfig)
import { getConfig } from "@/lib/appConfig";
import { resolveKnobs } from "@/modules/admin/knobs";

type KnobTree = Record<string, Record<string, unknown>>;

/** Effective (defaults + override) knob values for one game group. */
export async function getGameKnobs(game: string): Promise<Record<string, number | boolean>> {
  const tree = (await getConfig<KnobTree>("knobs")) ?? {};
  return resolveKnobs(game, tree[game]);
}

/**
 * TTL-cached reader for hot paths (arcade plays). Reads AppConfig at most
 * once per CACHE_MS; callers may use a slightly stale value, which is fine
 * at friend-group scale and keeps the coin games off a per-play DB hit.
 */
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; values: Record<string, number | boolean> }>();

export async function getGameKnobsCached(game: string): Promise<Record<string, number | boolean>> {
  const hit = cache.get(game);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.values;
  const values = await getGameKnobs(game);
  cache.set(game, { at: now, values });
  return values;
}
