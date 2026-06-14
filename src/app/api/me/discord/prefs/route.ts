import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/**
 * The signed-in user's Discord DM notification opt-ins (DiscordNotifyPref).
 * Surfaced on /me and consumed by the Wave 4 DM alerts + digest. The cached
 * dmChannelId is never exposed or written here — only the category toggles.
 */

const prefsSchema = z.object({
  dmTurn: z.boolean(),
  dmClaims: z.boolean(),
  dmStakes: z.boolean(),
  dmMentions: z.boolean(),
  dmDigest: z.boolean(),
  digestDaily: z.boolean(),
});

type Prefs = z.infer<typeof prefsSchema>;

// Mirror the DiscordNotifyPref model defaults so an unset user sees the truth.
const DEFAULTS: Prefs = {
  dmTurn: true,
  dmClaims: true,
  dmStakes: true,
  dmMentions: true,
  dmDigest: false,
  digestDaily: false,
};

function view(pref: Partial<Prefs> | null): Prefs {
  return {
    dmTurn: pref?.dmTurn ?? DEFAULTS.dmTurn,
    dmClaims: pref?.dmClaims ?? DEFAULTS.dmClaims,
    dmStakes: pref?.dmStakes ?? DEFAULTS.dmStakes,
    dmMentions: pref?.dmMentions ?? DEFAULTS.dmMentions,
    dmDigest: pref?.dmDigest ?? DEFAULTS.dmDigest,
    digestDaily: pref?.digestDaily ?? DEFAULTS.digestDaily,
  };
}

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const pref = await db.discordNotifyPref.findUnique({ where: { userId: user.id } });
  return NextResponse.json(view(pref));
});

export const PUT = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, prefsSchema);
  const pref = await db.discordNotifyPref.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return NextResponse.json(view(pref));
});
