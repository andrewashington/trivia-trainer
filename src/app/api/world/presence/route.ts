import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  heartbeat,
  leave,
  peers,
  type PresenceEntry,
} from "@/modules/world/presenceStore";

const heartbeatSchema = z.object({
  mapId: z.string().min(1).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  facing: z.enum(["down", "up", "left", "right"]),
  moving: z.boolean(),
  /** true = goodbye (sent via sendBeacon on page hide); position ignored. */
  leaving: z.boolean().optional(),
});

// The avatar sheet path is looked up once per (user, map) join and then
// carried on the presence entry — avoids a DB read on every 2s heartbeat.
const sheetCache = new Map<string, string>();

async function sheetPathFor(userId: string): Promise<string> {
  const cached = sheetCache.get(userId);
  if (cached) return cached;
  const avatar = await db.worldAvatar.findUnique({ where: { userId } });
  // No avatar shouldn't happen (page redirects to /world/create) — fall
  // back to the premade sheet rather than erroring the heartbeat.
  const path = avatar
    ? `avatars/${userId}.png?v=${avatar.updatedAt.getTime()}`
    : "character.png";
  sheetCache.set(userId, path);
  return path;
}

/**
 * POST /api/world/presence — heartbeat: report my position, get peers
 * on the same map back. One round-trip does both (v1 polling transport).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, heartbeatSchema);

  if (body.leaving) {
    leave(body.mapId, user.id);
    sheetCache.delete(user.id); // re-resolve (and re-cache-bust) on next join
    return NextResponse.json({ ok: true });
  }

  heartbeat(body.mapId, {
    userId: user.id,
    name: user.displayName,
    sheetPath: await sheetPathFor(user.id),
    x: body.x,
    y: body.y,
    facing: body.facing,
    moving: body.moving,
  });

  const others: PresenceEntry[] = peers(body.mapId, user.id);
  return NextResponse.json({ peers: others });
});
