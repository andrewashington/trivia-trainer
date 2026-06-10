import { moduleStyle, type CardSpec } from "@/lib/discord/feed";

/**
 * Posts one rendered card to the channel webhook. multipart/form-data
 * with payload_json + files[0], per the Discord webhook-execution API;
 * the embed image points at the attachment via attachment://.
 */
export async function postCardToDiscord(
  spec: CardSpec,
  actorName: string | null,
  png: Buffer
): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

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

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook ${res.status}: ${body.slice(0, 300)}`);
  }
}
