import { botConfig, DISCORD_API } from "@/lib/discord/bot";
import { moduleStyle, type CardSpec } from "@/lib/discord/feed";

/**
 * Posts one rendered card to the feed channel. multipart/form-data
 * with payload_json + files[0]; the embed image points at the
 * attachment via attachment://.
 *
 * When the bot is configured (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID)
 * the card goes out as a bot message — same payload shape, but bot
 * messages can carry interactive components (phase 2). Otherwise it
 * falls back to the legacy DISCORD_WEBHOOK_URL.
 */
export async function postCardToDiscord(
  spec: CardSpec,
  actorName: string | null,
  png: Buffer
): Promise<void> {
  const { botToken, channelId, canPost } = botConfig();
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!canPost && !url) return;

  const style = moduleStyle[spec.module];
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const embed: Record<string, unknown> = {
    title: `${spec.kicker} — ${spec.headline}`.slice(0, 256),
    color: parseInt(style.accent.slice(1), 16),
    image: { url: "attachment://card.png" },
    footer: { text: `UDM+ · ${style.label}` },
    timestamp: new Date().toISOString(),
  };
  if (base) embed.url = `${base}${spec.path}`;
  if (actorName) embed.author = { name: actorName };

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } })
  );
  form.append("files[0]", new Blob([new Uint8Array(png)], { type: "image/png" }), "card.png");

  const res = canPost
    ? await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${botToken}` },
        body: form,
      })
    : await fetch(url!, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord post ${res.status}: ${body.slice(0, 300)}`);
  }
}
