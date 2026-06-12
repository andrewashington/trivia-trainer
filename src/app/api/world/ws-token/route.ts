import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/**
 * GET /api/world/ws-token — short-lived credential for the world-ws
 * sidecar (services/world-ws). The token carries everything the sidecar
 * needs to know about the user (id, display name, avatar sheet path) so
 * the sidecar stays database-free. Format: base64url(JSON payload) +
 * "." + base64url(HMAC-SHA256(payload)) with the shared
 * WORLD_WS_SECRET. Verified by verifyToken in services/world-ws/server.js
 * — keep the two in sync.
 *
 * Returns { url: null } when the sidecar isn't configured (no
 * WORLD_WS_URL/WORLD_WS_SECRET) — the client then falls back to the v1
 * polling transport.
 */

const TOKEN_TTL_MS = 60_000;

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const url = process.env.WORLD_WS_URL;
  const secret = process.env.WORLD_WS_SECRET;
  if (!url || !secret) return NextResponse.json({ url: null, token: null });

  const avatar = await db.worldAvatar.findUnique({ where: { userId: user.id } });
  const sheetPath = avatar
    ? `avatars/${user.id}.png?v=${avatar.updatedAt.getTime()}`
    : "character.png";

  const payload = Buffer.from(
    JSON.stringify({
      userId: user.id,
      name: user.displayName,
      sheetPath,
      exp: Date.now() + TOKEN_TTL_MS,
    }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");

  return NextResponse.json({ url, token: `${payload}.${sig}` });
});
