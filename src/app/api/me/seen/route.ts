import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { modules } from "@/modules/registry";

const input = z.object({
  module: z.string().refine((k) => modules.some((m) => m.key === k), "Unknown module."),
});

/**
 * Mark a module as "seen" now — clears its unread nav badge. Called by
 * SeenTracker whenever the user lands on a module's route.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { module } = await parseBody(req, input);
  const seen = (user.moduleSeenAt as Record<string, string> | null) ?? {};
  seen[module] = new Date().toISOString();
  await db.user.update({ where: { id: user.id }, data: { moduleSeenAt: seen } });
  return NextResponse.json({ ok: true });
});
