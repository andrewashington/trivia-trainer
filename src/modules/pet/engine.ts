import { db } from "@/lib/db";

/**
 * The Pet's mood is DERIVED — it reads the outbox, which every module
 * already writes to transactionally, so group liveliness needs zero
 * extra instrumentation and zero required input. Collective only:
 * nothing here is ever attributed to a person.
 *
 * Decay is gentle by design (a 7-day window, recent days weighted),
 * and the floor is "sad", never dead: a single new event starts the
 * recovery. Permanent death is deliberately not a thing.
 */

export type PetMood = "thriving" | "happy" | "okay" | "sleepy" | "sad";

export type PetView = {
  name: string;
  mood: PetMood;
  score: number;
  /** What the pet "ate" this week, by module emoji — collective only. */
  diet: { emoji: string; label: string; count: number }[];
  nudgesToday: number;
  canNudge: boolean;
};

const MOOD_THRESHOLDS: [number, PetMood][] = [
  [20, "thriving"],
  [10, "happy"],
  [5, "okay"],
  [1, "sleepy"],
  [0, "sad"],
];

export const MOOD_META: Record<
  PetMood,
  { face: string; line: string; bg: string }
> = {
  thriving: { face: "🤩", line: "is THRIVING. What a week.", bg: "bg-accent-yellow" },
  happy: { face: "😊", line: "is happy. The group's alive!", bg: "bg-accent-green" },
  okay: { face: "🙂", line: "is doing okay. Could eat.", bg: "bg-accent-sky" },
  sleepy: { face: "😴", line: "is sleepy… it's quiet around here.", bg: "bg-paper" },
  sad: { face: "🥺", line: "misses you all. Anything counts.", bg: "bg-paper" },
};

// type prefix → module flavor for the diet readout
const DIET_MAP: [string, string, string][] = [
  ["recipe.", "🍳", "recipes"],
  ["event.", "📅", "event buzz"],
  ["nowplaying.", "📺", "watch updates"],
  ["file.", "📦", "files"],
  ["wishlist.", "🎁", "wishes"],
  ["contact.", "📇", "card updates"],
  ["vault.", "🔐", "vault keys"],
  ["map.", "🗺️", "map pins"],
  ["idea.", "💡", "ideas & votes"],
  ["listing.", "🏷️", "market action"],
  ["poll.", "🗳️", "poll energy"],
  ["reveal.", "🎭", "secrets"],
  ["claim.", "🎯", "hot takes"],
  ["forfeit.", "☠️", "consequences"],
  ["member.", "👋", "roster moves"],
];

export async function getPetView(viewerId: string): Promise<PetView> {
  const now = Date.now();
  const d3 = new Date(now - 3 * 86_400_000);
  const d7 = new Date(now - 7 * 86_400_000);
  const todayStart = new Date(now - 86_400_000);

  const [state, events, nudges3d, myNudgeToday, nudgesToday] = await Promise.all([
    db.petState.upsert({ where: { id: 1 }, create: {}, update: {} }),
    db.outboxEvent.findMany({
      where: { createdAt: { gte: d7 }, NOT: { type: { startsWith: "pet." } } },
      select: { type: true, createdAt: true },
    }),
    db.petNudge.count({ where: { createdAt: { gte: d3 } } }),
    db.petNudge.count({ where: { userId: viewerId, createdAt: { gte: todayStart } } }),
    db.petNudge.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  const recent = events.filter((e) => e.createdAt >= d3).length;
  const older = events.length - recent;
  const score = recent * 2 + older + nudges3d * 2;

  const mood = MOOD_THRESHOLDS.find(([min]) => score >= min)![1];

  const dietCounts = new Map<string, number>();
  for (const e of events) {
    const hit = DIET_MAP.find(([prefix]) => e.type.startsWith(prefix));
    if (hit) dietCounts.set(hit[0], (dietCounts.get(hit[0]) ?? 0) + 1);
  }
  const diet = DIET_MAP.filter(([prefix]) => dietCounts.has(prefix))
    .map(([prefix, emoji, label]) => ({ emoji, label, count: dietCounts.get(prefix)! }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    name: state.name,
    mood,
    score,
    diet,
    nudgesToday,
    canNudge: myNudgeToday === 0,
  };
}
