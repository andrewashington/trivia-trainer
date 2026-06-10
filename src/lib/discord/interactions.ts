import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Slash-command dispatcher for the Discord bot (phase 1: /link and
 * /unlink). Called from the interactions route after signature
 * verification; every handler returns an interaction-response object
 * that the route sends back as JSON. All replies are ephemeral — bot
 * chatter stays out of the channel.
 *
 * Interaction wire constants (https://discord.com/developers/docs/interactions):
 *   type 1 = PING, 2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT
 *   response 1 = PONG, 4 = CHANNEL_MESSAGE_WITH_SOURCE
 *   flags 64 = ephemeral
 */

const EPHEMERAL = 64;

type Interaction = {
  type: number;
  data?: { name?: string; custom_id?: string };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
};
type DiscordUser = { id: string; username?: string; global_name?: string | null };

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I — the user retypes this by hand.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function mintCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function ephemeralReply(content: string) {
  return { type: 4, data: { content, flags: EPHEMERAL } };
}

export async function handleInteraction(interaction: Interaction): Promise<object> {
  if (interaction.type === 1) return { type: 1 }; // PING → PONG

  const discordUser = interaction.member?.user ?? interaction.user;
  if (!discordUser?.id) return ephemeralReply("Couldn't tell who you are. Try again.");

  if (interaction.type === 2) {
    switch (interaction.data?.name) {
      case "link":
        return handleLink(discordUser);
      case "unlink":
        return handleUnlink(discordUser);
      default:
        return ephemeralReply("Unknown command.");
    }
  }

  // type 3 (buttons/selects) arrives in phase 2.
  return ephemeralReply("Nothing wired up for that yet.");
}

async function handleLink(discordUser: DiscordUser): Promise<object> {
  const existing = await db.user.findUnique({
    where: { discordUserId: discordUser.id },
    select: { displayName: true },
  });
  if (existing) {
    return ephemeralReply(
      `This Discord account is already linked to **${existing.displayName}** on UDM+. Use \`/unlink\` first if that's wrong.`
    );
  }

  const code = mintCode();
  const username = discordUser.global_name ?? discordUser.username ?? "unknown";
  await db.$transaction([
    // One live code per Discord account; re-running /link replaces it.
    db.discordLinkCode.deleteMany({ where: { discordUserId: discordUser.id } }),
    db.discordLinkCode.create({
      data: {
        code,
        discordUserId: discordUser.id,
        discordUsername: username,
        expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      },
    }),
  ]);

  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  return ephemeralReply(
    `Your link code is **\`${code}\`** — enter it on your profile page${base ? ` (${base}/me)` : " (the “You” tab)"} within 10 minutes. Only you can see this message.`
  );
}

async function handleUnlink(discordUser: DiscordUser): Promise<object> {
  const user = await db.user.findUnique({
    where: { discordUserId: discordUser.id },
    select: { id: true, displayName: true },
  });
  if (!user) return ephemeralReply("This Discord account isn't linked to anyone on UDM+.");

  await db.user.update({ where: { id: user.id }, data: { discordUserId: null } });
  return ephemeralReply(`Unlinked from **${user.displayName}**. Run \`/link\` any time to reconnect.`);
}
