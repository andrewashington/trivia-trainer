import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";

/**
 * Redeem a Discord link code (minted by the bot's /link command) for
 * the signed-in user, or disconnect. Pairs with /api/discord/interactions.
 */

const redeemSchema = z.object({ code: z.string().trim().min(1).max(16) });

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { code } = await parseBody(req, redeemSchema);

  const row = await db.discordLinkCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!row || row.expiresAt < new Date()) {
    throw new HttpError(400, "That code isn't valid (or expired). Run /link in Discord again.");
  }

  await db.$transaction([
    // discordUserId is unique — if it somehow points elsewhere, move it.
    db.user.updateMany({
      where: { discordUserId: row.discordUserId },
      data: { discordUserId: null },
    }),
    db.user.update({ where: { id: user.id }, data: { discordUserId: row.discordUserId } }),
    db.discordLinkCode.deleteMany({ where: { discordUserId: row.discordUserId } }),
  ]);

  return NextResponse.json({ ok: true, discordUsername: row.discordUsername });
});

export const DELETE = apiHandler(async () => {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { discordUserId: null } });
  return NextResponse.json({ ok: true });
});
