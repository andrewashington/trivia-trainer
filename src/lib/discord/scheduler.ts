import { botConfig } from "@/lib/discord/bot";

/**
 * In-process time-of-day scheduler for Discord (same philosophy as the
 * drainer's interval — no cron at friend-group scale). A 60s tick fires due
 * jobs; each job guards itself so it runs at most once per window. Started from
 * instrumentation.ts; a no-op when the bot is unconfigured.
 *
 * Job bodies (digest, your-turn / stake-resolving sweeps) land in Wave 4; the
 * tick + once-per-window plumbing is the Wave 0 backbone.
 */

const TICK_MS = 60_000;

let started = false;
let ticking = false;

/** Remembers the last window each keyed job ran in (in-memory; a restart just
 * re-checks, which is fine at this scale). */
const lastRun = new Map<string, string>();

/** Returns true once per `windowStamp` for a given job key. */
export function oncePerWindow(key: string, windowStamp: string): boolean {
  if (lastRun.get(key) === windowStamp) return false;
  lastRun.set(key, windowStamp);
  return true;
}

export function startDiscordScheduler() {
  if (started) return;
  if (!botConfig().canPost) {
    console.log("[discord] scheduler disabled (no bot token/channel)");
    return;
  }
  started = true;
  console.log("[discord] scheduler started");
  setInterval(() => void tick(), TICK_MS).unref?.();
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await runDueJobs();
  } catch (err) {
    console.error("[discord] scheduler tick failed", err);
  } finally {
    ticking = false;
  }
}

/**
 * Fire any due scheduler jobs. Wave 4 fills these in:
 *   - digest (daily/weekly per DiscordNotifyPref) at discord.settings.digestHour
 *   - your-turn sweep (Tanks / 20Q / Poker)
 *   - stake-resolving-soon sweep
 * Each will use `oncePerWindow(...)` to fire once per window and `dmUser(...)`
 * gated by the relevant DiscordNotifyPref flag.
 */
async function runDueJobs(): Promise<void> {
  // Wave 4: digest + sweeps.
}
