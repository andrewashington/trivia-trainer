import type { User } from "@prisma/client";
import { DISCORD_API, botConfig } from "@/lib/discord/bot";
import { registerFeature } from "@/lib/discord/registry";
import { runAssistant } from "@/lib/discord/assistant";
import { splitForDiscord } from "@/lib/discord/split";
import type { Interaction } from "@/lib/discord/interactions";
import { db } from "@/lib/db";

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
      content = await runAssistant({ userId: user.id, text, channelId });
    } catch (err) {
      console.error("[discord] /udm failed", err);
      content = "Something broke on my end — try again.";
    }
    if (appId && token) {
      // First chunk edits the deferred (ephemeral) reply; any overflow posts as
      // further ephemeral follow-ups so a long answer is never cut off.
      const parts = splitForDiscord(content);
      if (parts.length) {
        await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: parts[0] }),
        }).catch((err) => console.error("[discord] /udm follow-up failed", err));
        for (const part of parts.slice(1)) {
          await fetch(`${DISCORD_API}/webhooks/${appId}/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: part, flags: EPHEMERAL }),
          }).catch((err) => console.error("[discord] /udm follow-up failed", err));
        }
      }
    }
  };
  void finish();

  return { type: 5, data: { flags: EPHEMERAL } }; // deferred ephemeral
}

async function handleClear(_user: User, interaction: Interaction): Promise<object> {
  const channelId = interaction.channel_id;
  if (!channelId) {
    return { type: 4, data: { content: "No channel to clear.", flags: EPHEMERAL } };
  }
  const { count } = await db.discordTurn.deleteMany({ where: { channelId } });
  const msg =
    count === 0
      ? "nothing in the record for this channel. a clean slate either way."
      : `${count} exchange${count === 1 ? "" : "s"} cleared. the record has been expunged. we start fresh.`;
  return { type: 4, data: { content: msg, flags: EPHEMERAL } };
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
    {
      name: "clear",
      description: "Start a fresh conversation — clears UDM+'s memory of this channel's recent exchanges",
      type: 1,
    },
  ],
  commandHandlers: { udm: handleUdm, clear: handleClear },
});
