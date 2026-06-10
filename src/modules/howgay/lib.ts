/**
 * How Gay? core: the deterministic daily reading and its brackets.
 * Pure functions, shared by the server route, page, and client meter.
 *
 * The number is a hash of userId + day — one reading per person per
 * day, no rerolls, no appeals. The meter has spoken.
 */

export type GayBracket = {
  min: number;
  label: string;
  flavor: string;
};

/** Celebratory brackets, low to high. Never mean — the meter loves you. */
export const BRACKETS: GayBracket[] = [
  {
    min: 0,
    label: "Barely a Glimmer",
    flavor: "A faint shimmer on the horizon. The meter sees potential.",
  },
  {
    min: 10,
    label: "A Whisper of Whimsy",
    flavor: "Mostly beige today, but something hummed along to Chappell Roan.",
  },
  {
    min: 20,
    label: "Suspicious Playlist Energy",
    flavor: "Outwardly composed. Inwardly, the queue tells another story.",
  },
  {
    min: 30,
    label: "Brunch Curious",
    flavor: "You said 'oh this old thing?' about an outfit you planned for days.",
  },
  {
    min: 40,
    label: "Vibes Detected",
    flavor: "The meter picked up sustained eye contact with a well-dressed stranger.",
  },
  {
    min: 50,
    label: "Perfectly Balanced, Fabulously So",
    flavor: "Half shimmer, half mystery. Statistically iconic.",
  },
  {
    min: 60,
    label: "Glitter in the Bloodstream",
    flavor: "Doctors are baffled. Friends are not.",
  },
  {
    min: 70,
    label: "Walking Pride Flag",
    flavor: "Visible from space. Several parades have requested your schedule.",
  },
  {
    min: 80,
    label: "Serving, Honestly",
    flavor: "Today you are the moment. Everyone else is simply attending.",
  },
  {
    min: 90,
    label: "Beacon of Fabulousness",
    flavor: "Ships navigate by you. The confetti is legally required.",
  },
  {
    min: 100,
    label: "Certified Icon",
    flavor: "A perfect score. Frame this. Tell your grandchildren.",
  },
];

export function bracketFor(percent: number): GayBracket {
  let hit = BRACKETS[0];
  for (const b of BRACKETS) if (percent >= b.min) hit = b;
  return hit;
}

/** Server-local day key (YYYY-MM-DD) — page and API agree by construction. */
export function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Deterministic 0–100 reading: FNV-1a over `userId:date`. Same person,
 * same day, same number — pressing harder does not help.
 */
export function gayPercent(userId: string, date: string): number {
  const input = `${userId}:${date}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 101;
}
