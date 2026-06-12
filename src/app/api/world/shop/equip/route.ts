import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import type { AvatarConfig } from "@/modules/world/avatar";
import { buildAvatarSheet } from "@/modules/world/avatarServer";
import { wearableOutfits } from "@/modules/world/cosmetics";

const equipInput = z.object({
  kind: z.literal("outfit"),
  style: z.string().regex(/^\d{2}$/),
  color: z.string().regex(/^\d{2}$/),
});

/**
 * POST /api/world/shop/equip — wear an owned (or starter) outfit.
 * Merges into the existing avatar config and re-composites the sheet,
 * so it works from the shop without round-tripping the creator.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { style, color } = await parseBody(req, equipInput);

  const avatar = await db.worldAvatar.findUnique({ where: { userId: user.id } });
  if (!avatar) throw new HttpError(404, "Make a character first — clothes need a body.");

  const owned = await db.worldOwnedCosmetic.findMany({
    where: { userId: user.id, kind: "outfit" },
    select: { itemKey: true },
  });
  const wearable = wearableOutfits(owned.map((o) => o.itemKey));
  if (!wearable[style]?.includes(color)) {
    throw new HttpError(403, "You don't own that one. The fitting room is not a loophole.");
  }

  const config: AvatarConfig = {
    ...(avatar.config as AvatarConfig),
    outfit: { style, color },
  };
  const sheetPath = await buildAvatarSheet(user.id, config, wearable);
  const updated = await db.worldAvatar.update({
    where: { userId: user.id },
    data: { config },
  });

  return NextResponse.json({
    ok: true,
    sheetPath: `${sheetPath}?v=${updated.updatedAt.getTime()}`,
  });
});
