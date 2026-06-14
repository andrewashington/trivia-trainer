// server-side only (imports db) — keep out of client components
import { db } from "@/lib/db";

/**
 * App-wide config: code ships the defaults, the AppConfig table holds admin
 * overrides (edited in /admin), and callers merge the two at the decision
 * site. Mirrors src/modules/world/content.ts but is not world-namespaced —
 * this is the home for Discord toggles, promo overrides, and game knobs.
 *
 * Always read effective values through a typed getter so admin edits take
 * effect without a deploy, and a missing row means "today's behavior".
 */

export type AppConfigKey = "discord.feeds" | "coin.rewards" | "knobs" | "discord.settings";

export async function getConfig<T>(key: AppConfigKey): Promise<T | null> {
  const row = await db.appConfig.findUnique({ where: { key } });
  return (row?.value as T) ?? null;
}

/** All override documents as one object — for the admin console to hydrate. */
export async function getAllConfig(): Promise<Record<string, unknown>> {
  const rows = await db.appConfig.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setConfig(key: AppConfigKey, value: unknown): Promise<void> {
  await db.appConfig.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
