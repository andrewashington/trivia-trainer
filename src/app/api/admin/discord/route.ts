import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { getConfig, setConfig } from "@/lib/appConfig";
import { feedMode } from "@/lib/discord/bot";
import { requireAdmin } from "@/lib/session";
import { discordFeedsPut } from "@/modules/admin/schema";

/** GET /api/admin/discord — muted event set + feed transport mode. */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const cfg = await getConfig<{ disabled?: string[] }>("discord.feeds");
  return NextResponse.json({ disabled: cfg?.disabled ?? [], mode: feedMode() });
});

/** PUT /api/admin/discord — replace the muted event set. */
export const PUT = apiHandler(async (req: Request) => {
  await requireAdmin();
  const { disabled } = await parseBody(req, discordFeedsPut);
  await setConfig("discord.feeds", { disabled });
  return NextResponse.json({ ok: true });
});
