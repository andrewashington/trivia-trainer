import { discordApi } from "@/lib/discord/bot";

/**
 * Fetch the most recent messages in a channel (oldest→newest), for assistant
 * context like "make a poll about this chat". Skips bot messages, empties, and
 * the triggering message. Best-effort: returns [] on any failure so the
 * assistant still runs.
 */
export async function fetchRecentMessages(
  channelId: string,
  limit = 18,
  excludeMessageId?: string
): Promise<{ author: string; text: string }[]> {
  try {
    const n = Math.min(50, Math.max(1, limit));
    const res = await discordApi(`/channels/${channelId}/messages?limit=${n}`, { method: "GET" });
    const msgs = (await res.json()) as {
      id: string;
      content?: string;
      author?: { bot?: boolean; global_name?: string | null; username?: string };
    }[];
    return msgs
      .filter((m) => m.id !== excludeMessageId && !m.author?.bot && (m.content ?? "").trim())
      .map((m) => ({
        author: m.author?.global_name || m.author?.username || "someone",
        text: (m.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      }))
      .reverse(); // Discord returns newest-first; the model reads better chronologically
  } catch (err) {
    console.error("[discord] fetchRecentMessages failed", err);
    return [];
  }
}
