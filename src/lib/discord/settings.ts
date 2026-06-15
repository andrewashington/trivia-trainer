import { getConfig } from "@/lib/appConfig";

/**
 * Discord feature settings (AppConfig key "discord.settings"). Code ships the
 * defaults; the admin Discord tab overrides them, and read-sites merge the two.
 * Tips default OFF — they make coins transferable (a change from the
 * non-transferable rule), so the owner flips that on deliberately (spec §7).
 */
export type DiscordSettings = {
  tipsEnabled: boolean;
  dropsEnabled: boolean;
  aiEnabled: boolean;
  archiveEnabled: boolean;
  rewardsEnabled: boolean;
  digestDay: number; // 0–6 (Sun–Sat) — used for the weekly digest
  digestHour: number; // 0–23, local to FEED_TZ
  aiModel: string; // overrides OPENROUTER_MODEL when non-empty
};

export const DISCORD_SETTINGS_DEFAULTS: DiscordSettings = {
  tipsEnabled: false,
  dropsEnabled: true,
  aiEnabled: true,
  archiveEnabled: true,
  rewardsEnabled: false,
  digestDay: 1, // Monday
  digestHour: 9,
  aiModel: "",
};

/** Effective Discord settings (defaults merged with any admin override). */
export async function getDiscordSettings(): Promise<DiscordSettings> {
  const cfg = await getConfig<Partial<DiscordSettings>>("discord.settings");
  return { ...DISCORD_SETTINGS_DEFAULTS, ...(cfg ?? {}) };
}
