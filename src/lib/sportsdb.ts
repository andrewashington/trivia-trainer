/**
 * TheSportsDB client — the oracle behind sports-mode Stakes. Server-only.
 *
 * Free-tier ("123") quirks this design works around: list endpoints are
 * capped at 1-10 rows, so there is no "browse all fixtures" flow. Instead:
 * search a team by name → fetch that team's next game → bet on it. Event
 * lookup (used for settlement) returns full data on the free tier.
 */

const KEY = process.env.SPORTSDB_API_KEY || "123";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

// Major leagues only — used to filter team search noise.
export const MAJOR_LEAGUES = new Set([
  "NFL",
  "NBA",
  "MLB",
  "NHL",
  "English Premier League",
]);

export type SportsTeam = {
  id: string;
  name: string;
  league: string;
  badge: string | null;
};

export type SportsEvent = {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  cancelled: boolean;
};

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}/${path}`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}`);
  return res.json();
}

function toScore(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toEvent(raw: any): SportsEvent | null {
  if (!raw?.idEvent || !raw.strHomeTeam || !raw.strAwayTeam) return null;
  // strTimestamp is UTC without a zone marker.
  const ts = raw.strTimestamp
    ? new Date(`${raw.strTimestamp}Z`)
    : raw.dateEvent
      ? new Date(`${raw.dateEvent}T00:00:00Z`)
      : null;
  if (!ts || Number.isNaN(ts.getTime())) return null;
  const status = String(raw.strStatus ?? "");
  return {
    id: String(raw.idEvent),
    league: String(raw.strLeague ?? ""),
    homeTeam: String(raw.strHomeTeam),
    awayTeam: String(raw.strAwayTeam),
    startsAt: ts,
    homeScore: toScore(raw.intHomeScore),
    awayScore: toScore(raw.intAwayScore),
    finished: /finished|^ft$|final|^ao?t$|after/i.test(status),
    cancelled: /cancel|postpon|abandon|suspend/i.test(status),
  };
}

/** Search teams by name, restricted to the five major leagues. */
export async function searchTeams(q: string): Promise<SportsTeam[]> {
  const data = await get(`searchteams.php?t=${encodeURIComponent(q)}`);
  return ((data.teams as any[]) ?? [])
    .filter((t) => MAJOR_LEAGUES.has(t.strLeague))
    .slice(0, 8)
    .map((t) => ({
      id: String(t.idTeam),
      name: String(t.strTeam),
      league: String(t.strLeague),
      badge: t.strBadge ? String(t.strBadge) : null,
    }));
}

/** A team's next scheduled game (free tier returns at least one). */
export async function nextEventForTeam(teamId: string): Promise<SportsEvent | null> {
  const data = await get(`eventsnext.php?id=${encodeURIComponent(teamId)}`);
  const events = ((data.events as any[]) ?? [])
    .map(toEvent)
    .filter((e): e is SportsEvent => e !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return events[0] ?? null;
}

/** Full event detail — settlement reads the final score from here. */
export async function lookupEvent(eventId: string): Promise<SportsEvent | null> {
  const data = await get(`lookupevent.php?id=${encodeURIComponent(eventId)}`);
  return toEvent(((data.events as any[]) ?? [])[0]);
}
