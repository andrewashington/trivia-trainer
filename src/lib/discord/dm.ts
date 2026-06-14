import { db } from "@/lib/db";
import { discordApi, botConfig } from "@/lib/discord/bot";
import { postV2 } from "@/lib/discord/components";

/**
 * Direct-message delivery. Opens (and caches) a DM channel for a UDM+ user and
 * sends a Components V2 message. Pure delivery — the CALLER is responsible for
 * checking the relevant `DiscordNotifyPref` category flag before calling this.
 *
 * Returns:
 *   "sent"    — delivered
 *   "blocked" — the user has DMs closed (Discord error 50007); do not retry
 *   "skip"    — bot unconfigured, user not linked, or a transient failure
 */
export async function dmUser(
  userId: string,
  components: object[]
): Promise<"sent" | "blocked" | "skip"> {
  if (!botConfig().canPost) return "skip";

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { discordUserId: true },
  });
  if (!user?.discordUserId) return "skip";

  // Reuse a cached DM channel id; open one the first time.
  const pref = await db.discordNotifyPref.findUnique({ where: { userId } });
  let channelId = pref?.dmChannelId ?? null;
  if (!channelId) {
    try {
      const res = await discordApi("/users/@me/channels", {
        method: "POST",
        body: { recipient_id: user.discordUserId },
      });
      const json = (await res.json()) as { id: string };
      channelId = json.id;
      await db.discordNotifyPref.upsert({
        where: { userId },
        create: { userId, dmChannelId: channelId },
        update: { dmChannelId: channelId },
      });
    } catch (err) {
      console.error("[discord] open DM channel failed", err);
      return "skip";
    }
  }

  try {
    await postV2(channelId, components);
    return "sent";
  } catch (err) {
    // 50007 = "Cannot send messages to this user" (DMs closed / not a mutual
    // server). Treat as a terminal soft-failure — never throw, never loop.
    if (err instanceof Error && err.message.includes("50007")) return "blocked";
    console.error("[discord] DM send failed", err);
    return "skip";
  }
}
