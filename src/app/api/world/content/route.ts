import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDialog } from "@/modules/world/content";

/**
 * GET /api/world/content — runtime game data for the world client
 * (admin-editable via /world/admin). The Phaser scene loads this once
 * per session; today it's NPC dialog, future tunables ride along.
 */
export const GET = apiHandler(async () => {
  await requireUser();
  return NextResponse.json({ dialog: await getDialog() });
});
