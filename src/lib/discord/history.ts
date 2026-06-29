import { discordApi } from "@/lib/discord/bot";
import { canonicalForAuthorId } from "@/lib/discord/identity-map";

/**
 * Fetch the most recent messages in a channel (oldest→newest), for assistant
 * context like "make a poll about this chat" or resolving a follow-up like
 * "add that to the recipe book". Keeps the assistant's OWN prior replies (so
 * cross-turn references resolve) but drops other bots, empties, and the
 * triggering message. Best-effort: returns [] on any failure so the assistant
 * still runs.
 */
export async function fetchRecentMessages(
  channelId: string,
  limit = 18,
  excludeMessageId?: string,
  // The channel's `/clear` watermark. When set, messages sent on/before this
  // moment are dropped, so a reset thread never drags pre-clear chatter back in.
  clearedAt?: Date | null
): Promise<{ author: string; text: string }[]> {
  try {
    const selfId = process.env.DISCORD_APP_ID || null;
    const n = Math.min(50, Math.max(1, limit));
    const res = await discordApi(`/channels/${channelId}/messages?limit=${n}`, { method: "GET" });
    const msgs = (await res.json()) as {
      id: string;
      content?: string;
      timestamp?: string;
      author?: { id?: string; bot?: boolean; global_name?: string | null; username?: string };
    }[];
    return msgs
      .filter((m) => {
        if (m.id === excludeMessageId || !(m.content ?? "").trim()) return false;
        // Respect the /clear boundary: anything at/before the watermark is gone.
        if (clearedAt && m.timestamp && new Date(m.timestamp).getTime() <= clearedAt.getTime()) return false;
        const isSelf = !!selfId && m.author?.id === selfId;
        return isSelf || !m.author?.bot; // keep humans + our own replies, drop other bots
      })
      .map((m) => {
        const isSelf = !!selfId && m.author?.id === selfId;
        return {
          // Prefer the curated real name over Discord's handle so attribution is
          // consistent with PEOPLE and the model never has to guess who's who.
          author: isSelf
            ? "UDM+ (you, the assistant — your earlier reply)"
            : canonicalForAuthorId(m.author?.id) || m.author?.global_name || m.author?.username || "someone",
          // Keep our own replies fuller so a follow-up ("add that") can recover
          // what we just surfaced; human messages stay tighter.
          text: (m.content ?? "").replace(/\s+/g, " ").trim().slice(0, isSelf ? 700 : 300),
        };
      })
      .reverse(); // Discord returns newest-first; the model reads better chronologically
  } catch (err) {
    console.error("[discord] fetchRecentMessages failed", err);
    return [];
  }
}
