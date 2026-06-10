import { createPublicKey, verify } from "node:crypto";

/**
 * Discord bot plumbing (phase 1). The bot is optional: every entry
 * point no-ops cleanly when the env vars are absent, so the app (and
 * the legacy webhook feed) keeps working without a configured bot.
 *
 * Env:
 *   DISCORD_APP_ID      — application ID (dev portal → General Information)
 *   DISCORD_PUBLIC_KEY  — interaction signature key (same page)
 *   DISCORD_BOT_TOKEN   — bot token (dev portal → Bot)
 *   DISCORD_CHANNEL_ID  — channel the feed posts to (right-click channel
 *                         → Copy Channel ID, with developer mode on)
 */

export const DISCORD_API = "https://discord.com/api/v10";

export function botConfig() {
  const appId = process.env.DISCORD_APP_ID || null;
  const publicKey = process.env.DISCORD_PUBLIC_KEY || null;
  const botToken = process.env.DISCORD_BOT_TOKEN || null;
  const channelId = process.env.DISCORD_CHANNEL_ID || null;
  return { appId, publicKey, botToken, channelId, canPost: !!(botToken && channelId) };
}

/**
 * Verify an interaction request's Ed25519 signature. Node has no raw
 * Ed25519 key import, so wrap the 32-byte key in a SPKI DER header.
 */
export function verifyInteractionSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string
): boolean {
  try {
    const spki = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKeyHex, "hex"),
    ]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    return verify(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      key,
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}

/** Authenticated call to the Discord REST API. Throws on non-2xx. */
export async function discordApi(
  path: string,
  init: { method?: string; body?: FormData | Record<string, unknown> } = {}
): Promise<Response> {
  const { botToken } = botConfig();
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN not configured");

  const headers: Record<string, string> = { Authorization: `Bot ${botToken}` };
  let body: FormData | string | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  const res = await fetch(`${DISCORD_API}${path}`, {
    method: init.method ?? "POST",
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord API ${init.method ?? "POST"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}
