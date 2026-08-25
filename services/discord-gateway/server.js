/**
 * UDM+ Discord @mention listener sidecar.
 *
 * A deliberately tiny gateway client (modeled on services/world-ws): it dials
 * out to Discord, listens for messages that @mention the bot, and forwards them
 * to the Next app over a shared HMAC secret. It holds NO app logic and NEVER
 * posts to Discord — the app runs the assistant and posts the reply, so all
 * posting/auth/AI lives in one place.
 *
 * Contract with the app (the only coupling):
 *   - DISCORD_GATEWAY_SECRET matches the app's
 *   - POST {discordUserId, channelId, messageId, guildId, text, referenced}
 *     to APP_FORWARD_URL with header x-udm-signature =
 *     hex(HMAC-SHA256(rawBody, DISCORD_GATEWAY_SECRET))
 *   - the app verifies the signature and handles everything else
 *
 * Deploy as its own Railway service (root services/discord-gateway, `npm start`,
 * exactly ONE replica — one gateway connection). Env: DISCORD_BOT_TOKEN,
 * DISCORD_APP_ID, DISCORD_GUILD_ID, DISCORD_GATEWAY_SECRET, APP_FORWARD_URL
 * (= <AUTH_URL>/api/discord/gateway), APP_INGEST_URL
 * (= <AUTH_URL>/api/discord/ingest). Enable the Message Content privileged
 * intent in the dev portal. The library handles heartbeat/reconnect/resume.
 */

import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { Client, GatewayIntentBits, Partials } from "discord.js";

const PORT = Number(process.env.PORT ?? 8082);
const SECRET = process.env.DISCORD_GATEWAY_SECRET;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const FORWARD_URL = process.env.APP_FORWARD_URL;
const INGEST_URL = process.env.APP_INGEST_URL;
if (!SECRET || !TOKEN || !FORWARD_URL) {
  console.error("DISCORD_GATEWAY_SECRET, DISCORD_BOT_TOKEN and APP_FORWARD_URL are required");
  process.exit(1);
}

// Plain HTTP underneath so Railway's healthcheck has something to hit.
createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("discord-gateway ok\n");
}).listen(PORT, () => console.log(`discord-gateway healthcheck on :${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

client.once("ready", () => console.log(`discord-gateway logged in as ${client.user?.tag}`));

client.on("messageCreate", async (message) => {
  try {
    if (message.author?.bot || !client.user) return;
    forwardIngest({
      kind: "create",
      message: serializeMessage(message),
    });

    // Only act on an explicit @mention of the bot user (not @everyone / roles).
    if (!message.mentions.users.has(client.user.id)) return;

    const mentionRe = new RegExp(`<@!?${client.user.id}>`, "g");
    const text = (message.content ?? "").replace(mentionRe, " ").replace(/\s+/g, " ").trim();

    // The "^" target: the message this one is replying to. Needs Message Content.
    let referenced = null;
    if (message.reference?.messageId) {
      try {
        const ref = await message.fetchReference();
        referenced = { authorId: ref.author?.id ?? null, content: ref.content ?? "" };
      } catch {
        /* deleted / inaccessible — ignore */
      }
    }

    const body = JSON.stringify({
      discordUserId: message.author.id,
      channelId: message.channelId,
      messageId: message.id,
      guildId: message.guildId ?? null,
      text,
      referenced,
    });
    const sig = createHmac("sha256", SECRET).update(body).digest("hex");

    // Fire-and-forget: the app posts the reply; we never touch Discord.
    fetch(FORWARD_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-udm-signature": sig },
      body,
    }).catch((err) => console.error("[gateway] forward failed", err));
  } catch (err) {
    console.error("[gateway] messageCreate error", err);
  }
});

client.on("messageUpdate", async (_oldMessage, newMessage) => {
  try {
    const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
    if (!message || message.author?.bot) return;
    forwardIngest({ kind: "update", message: serializeMessage(message) });
  } catch (err) {
    console.error("[gateway] messageUpdate error", err);
  }
});

client.on("messageDelete", async (message) => {
  try {
    forwardIngest({
      kind: "delete",
      id: message.id,
      channelId: message.channelId,
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[gateway] messageDelete error", err);
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    const fullReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
    const fullUser = user.partial ? await user.fetch().catch(() => null) : user;
    if (!fullReaction || !fullUser || fullUser.bot) return;
    forwardIngest({
      kind: "reaction",
      op: "add",
      messageId: fullReaction.message.id,
      channelId: fullReaction.message.channelId,
      emoji: emojiKey(fullReaction.emoji),
      userId: fullUser.id,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[gateway] messageReactionAdd error", err);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    const fullReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
    const fullUser = user.partial ? await user.fetch().catch(() => null) : user;
    if (!fullReaction || !fullUser || fullUser.bot) return;
    forwardIngest({
      kind: "reaction",
      op: "remove",
      messageId: fullReaction.message.id,
      channelId: fullReaction.message.channelId,
      emoji: emojiKey(fullReaction.emoji),
      userId: fullUser.id,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[gateway] messageReactionRemove error", err);
  }
});

function serializeMessage(message) {
  return {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId ?? null,
    channelName: "name" in message.channel ? message.channel.name ?? null : null,
    channelKind: message.channel?.type != null ? String(message.channel.type) : null,
    authorId: message.author?.id ?? "",
    authorName: message.member?.displayName ?? message.author?.globalName ?? message.author?.username ?? "unknown",
    authorAvatarUrl: avatarUrl(message),
    parentChannelId: parentChannelId(message),
    isBot: (message.author?.bot ?? false) || Boolean(message.webhookId),
    content: message.content ?? "",
    replyToId: message.reference?.messageId ?? null,
    attachments: [...(message.attachments?.values?.() ?? [])].map((a) => ({
      url: a.url,
      name: a.name ?? null,
      contentType: a.contentType ?? null,
      size: a.size ?? null,
    })),
    hasEmbed: (message.embeds?.length ?? 0) > 0,
    sentAt: message.createdAt?.toISOString?.() ?? new Date().toISOString(),
    editedAt: message.editedAt?.toISOString?.() ?? null,
  };
}

function emojiKey(emoji) {
  return emoji.id ? `${emoji.name ?? "emoji"}:${emoji.id}` : emoji.name ?? "";
}

function avatarUrl(message) {
  try {
    const src = message.member ?? message.author;
    return src?.displayAvatarURL?.({ extension: "png", size: 256 }) ?? null;
  } catch {
    return null;
  }
}

function parentChannelId(message) {
  const channel = message.channel;
  if (!channel) return null;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    return channel.parentId ?? null;
  }
  return null;
}

function forwardIngest(payload) {
  if (!INGEST_URL) return;
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", SECRET).update(body).digest("hex");
  fetch(INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-udm-signature": sig },
    body,
  }).catch((err) => console.error("[gateway] ingest forward failed", err));
}

client.login(TOKEN);
