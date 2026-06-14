import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { getConfig, setConfig } from "@/lib/appConfig";
import { feedMode } from "@/lib/discord/bot";
import { getDiscordSettings } from "@/lib/discord/settings";
import { requireAdmin } from "@/lib/session";
import { discordAdminPut } from "@/modules/admin/schema";

/** GET /api/admin/discord — muted event set, feed transport mode, feature settings. */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const cfg = await getConfig<{ disabled?: string[] }>("discord.feeds");
  const settings = await getDiscordSettings();
  return NextResponse.json({ disabled: cfg?.disabled ?? [], mode: feedMode(), settings });
});

/** PUT /api/admin/discord — replace the muted event set and feature settings. */
export const PUT = apiHandler(async (req: Request) => {
  await requireAdmin();
  const { disabled, settings } = await parseBody(req, discordAdminPut);
  await setConfig("discord.feeds", { disabled });
  await setConfig("discord.settings", settings);
  return NextResponse.json({ ok: true });
});
