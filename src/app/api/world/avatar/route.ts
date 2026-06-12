import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { avatarConfigSchema } from "@/modules/world/avatar";
import { buildAvatarSheet } from "@/modules/world/avatarServer";

/** GET /api/world/avatar — the caller's world-avatar config (null if unset). */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const avatar = await db.worldAvatar.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    config: avatar?.config ?? null,
    updatedAt: avatar?.updatedAt ?? null,
  });
});

/** POST /api/world/avatar — save config + composite the personal spritesheet. */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const config = await parseBody(req, avatarConfigSchema);

  let sheetPath: string;
  try {
    sheetPath = await buildAvatarSheet(user.id, config);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Bad avatar config.");
  }

  const avatar = await db.worldAvatar.upsert({
    where: { userId: user.id },
    create: { userId: user.id, config },
    update: { config },
  });

  return NextResponse.json({ ok: true, sheetPath, updatedAt: avatar.updatedAt });
});
