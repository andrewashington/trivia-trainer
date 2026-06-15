/**
 * Backfill Discord channel history into discord_archive.*.
 *
 *   npm run discord:backfill
 *   railway ssh -s trivia-trainer node scripts/discord-backfill.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = join(process.cwd());
loadEnv();

const DISCORD_API = "https://discord.com/api/v10";
const db = new PrismaClient();
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const TEXT_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12, 15]);
const includeBots = process.argv.includes("--include-bots") || process.env.DISCORD_ARCHIVE_INCLUDE_BOTS === "true";

async function main() {
  if (!token || !guildId) throw new Error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required");

  const channels = await discordGet(`/guilds/${guildId}/channels`);
  const textChannels = channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type));
  console.log(`[archive] backfilling ${textChannels.length} text-ish channels`);

  for (const channel of textChannels) {
    await upsertChannel(channel);
    await backfillChannel(channel);
  }
}

async function backfillChannel(channel) {
  const state = await db.$queryRaw`
    SELECT last_backfill_id, backfill_done FROM discord_archive.channels WHERE id = ${channel.id}
  `;
  if (state[0]?.backfill_done) {
    console.log(`[archive] #${channel.name ?? channel.id}: already done`);
    return;
  }

  let before = state[0]?.last_backfill_id ?? undefined;
  let total = 0;
  let skippedBots = 0;
  for (;;) {
    const path = `/channels/${channel.id}/messages?limit=100${before ? `&before=${before}` : ""}`;
    const messages = await discordGet(path);
    if (!messages.length) break;

    for (const message of messages) {
      if (!includeBots && message.author?.bot) {
        skippedBots++;
        continue;
      }
      await upsertMessage(message, channel);
    }
    before = messages[messages.length - 1]?.id;
    total += messages.length;
    await db.$executeRaw`
      UPDATE discord_archive.channels SET last_backfill_id = ${before ?? null} WHERE id = ${channel.id}
    `;
    const suffix = skippedBots ? `, skipped ${skippedBots} bot messages` : "";
    console.log(`[archive] #${channel.name ?? channel.id}: scanned ${messages.length} (${total})${suffix}`);
    await sleep(350);
  }

  await db.$executeRaw`
    UPDATE discord_archive.channels SET backfill_done = true WHERE id = ${channel.id}
  `;
}

async function upsertChannel(channel) {
  await db.$executeRaw`
    INSERT INTO discord_archive.channels (id, guild_id, name, kind)
    VALUES (${channel.id}, ${channel.guild_id ?? guildId ?? null}, ${channel.name ?? null}, ${String(channel.type)})
    ON CONFLICT (id) DO UPDATE SET
      guild_id = COALESCE(EXCLUDED.guild_id, discord_archive.channels.guild_id),
      name = COALESCE(EXCLUDED.name, discord_archive.channels.name),
      kind = COALESCE(EXCLUDED.kind, discord_archive.channels.kind)
  `;
}

async function upsertMessage(message, channel) {
  const displayName = message.member?.nick ?? message.author?.global_name ?? message.author?.username ?? "unknown";
  const attachments = JSON.stringify(
    (message.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.filename ?? null,
      contentType: a.content_type ?? null,
      size: a.size ?? null,
    }))
  );
  const reactionCount = (message.reactions ?? []).reduce((sum, r) => sum + (r.count ?? 0), 0);
  const user = await db.user.findUnique({
    where: { discordUserId: message.author.id },
    select: { id: true },
  });

  await db.$executeRaw`
    INSERT INTO discord_archive.messages (
      id, channel_id, guild_id, author_id, author_name, user_id, is_bot,
      content, reply_to_id, attachments, has_embed, reaction_count, sent_at, edited_at
    )
    VALUES (
      ${message.id}, ${channel.id}, ${message.guild_id ?? guildId ?? null},
      ${message.author.id}, ${displayName}, ${user?.id ?? null}, ${message.author.bot ?? false},
      ${message.content ?? ""}, ${message.message_reference?.message_id ?? null},
      ${attachments}::jsonb, ${(message.embeds ?? []).length > 0}, ${reactionCount},
      ${new Date(message.timestamp)}, ${message.edited_timestamp ? new Date(message.edited_timestamp) : null}
    )
    ON CONFLICT (id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      guild_id = EXCLUDED.guild_id,
      author_id = EXCLUDED.author_id,
      author_name = EXCLUDED.author_name,
      user_id = COALESCE(EXCLUDED.user_id, discord_archive.messages.user_id),
      is_bot = EXCLUDED.is_bot,
      content = EXCLUDED.content,
      reply_to_id = EXCLUDED.reply_to_id,
      attachments = EXCLUDED.attachments,
      has_embed = EXCLUDED.has_embed,
      reaction_count = GREATEST(discord_archive.messages.reaction_count, EXCLUDED.reaction_count),
      sent_at = EXCLUDED.sent_at,
      edited_at = COALESCE(EXCLUDED.edited_at, discord_archive.messages.edited_at),
      deleted_at = NULL
  `;
}

async function discordGet(path) {
  for (;;) {
    const res = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => null);
      await sleep(Math.ceil((body?.retry_after ?? 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Discord GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
