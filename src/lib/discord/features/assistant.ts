import type { User } from "@prisma/client";
import { DISCORD_API, botConfig } from "@/lib/discord/bot";
import { registerFeature } from "@/lib/discord/registry";
import { runAssistant } from "@/lib/discord/assistant";
import { fetchRecentMessages } from "@/lib/discord/history";
import type { Interaction } from "@/lib/discord/interactions";

/**
 * The /udm slash door onto the catch-all assistant. Self-registers with the
 * Discord feature registry (loaded via registry.ensureFeatures). The @mention
 * door (Wave 2) calls the same runAssistant brain.
 */

const EPHEMERAL = 64;

async function handleUdm(user: User, interaction: Interaction): Promise<object> {
  const text = String(
    interaction.data?.options?.find((o) => o.name === "message")?.value ?? ""
  ).trim();
  if (!text) {
    return {
      type: 4,
      data: { content: "Tell me what you want — e.g. `/udm what's on this weekend?`", flags: EPHEMERAL },
    };
  }

  // The model call is well past Discord's 3s ack window: defer (ephemeral),
  // run the assistant, then edit the original via the interaction-token webhook.
  const { appId } = botConfig();
  const token = interaction.token;
  const channelId = interaction.channel_id;
  const finish = async () => {
    let content: string;
    try {
      const recentMessages = channelId ? await fetchRecentMessages(channelId, 18) : [];
      content = await runAssistant({ userId: user.id, text, recentMessages });
    } catch (err) {
      console.error("[discord] /udm failed", err);
      content = "Something broke on my end — try again.";
    }
    if (appId && token) {
      await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.slice(0, 2000) }),
      }).catch((err) => console.error("[discord] /udm follow-up failed", err));
    }
  };
  void finish();

  return { type: 5, data: { flags: EPHEMERAL } }; // deferred ephemeral
}

registerFeature({
  key: "assistant",
  commands: [
    {
      name: "udm",
      description: "Ask UDM+ anything — a question, or to make / do something",
      type: 1,
      options: [
        { name: "message", description: "What do you want?", type: 3, required: true, max_length: 400 },
      ],
    },
  ],
  commandHandlers: { udm: handleUdm },
});
