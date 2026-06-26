import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { botConfig, discordApi } from "@/lib/discord/bot";
import { getDiscordSettings } from "@/lib/discord/settings";
import { runAssistant } from "@/lib/discord/assistant";
import { splitForDiscord } from "@/lib/discord/split";

/**
 * Forward endpoint for the @mention sidecar (services/discord-gateway). The
 * sidecar HMAC-signs the raw body with DISCORD_GATEWAY_SECRET; we verify it
 * (timing-safe, raw-body discipline like the interactions route), resolve the
 * user, run the assistant, and post the reply in-channel as the bot. No-ops
 * (503) when the gateway secret or bot is unconfigured.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.DISCORD_GATEWAY_SECRET;
  if (!secret || !botConfig().canPost) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const raw = await req.text();
  const provided = req.headers.get("x-udm-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: {
    discordUserId?: unknown;
    channelId?: unknown;
    messageId?: unknown;
    text?: unknown;
    referenced?: { content?: unknown } | null;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const discordUserId = typeof payload.discordUserId === "string" ? payload.discordUserId : null;
  const channelId = typeof payload.channelId === "string" ? payload.channelId : null;
  if (!discordUserId || !channelId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const text = typeof payload.text === "string" ? payload.text : "";
  const messageId = typeof payload.messageId === "string" ? payload.messageId : undefined;
  const sourceMessage =
    payload.referenced && typeof payload.referenced.content === "string"
      ? payload.referenced.content
      : undefined;

  // Process async; ack the sidecar fast so it isn't blocked on the model call.
  void handleMention({ discordUserId, channelId, text, sourceMessage, messageId });
  return NextResponse.json({ ok: true });
}

async function handleMention(input: {
  discordUserId: string;
  channelId: string;
  text: string;
  sourceMessage?: string;
  messageId?: string;
}) {
  try {
    const user = await db.user.findUnique({ where: { discordUserId: input.discordUserId } });
    if (!user) {
      await postChannel(
        input.channelId,
        `<@${input.discordUserId}> — link your UDM+ first: run \`/link\` and enter the code on your profile page.`
      );
      return;
    }

    const settings = await getDiscordSettings();
    if (!settings.aiEnabled) {
      await postChannel(input.channelId, `<@${input.discordUserId}> the assistant is switched off right now.`);
      return;
    }
    if (!input.text) {
      await postChannel(input.channelId, `<@${input.discordUserId}> you rang? Ask me something.`);
      return;
    }

    // Typing indicator while the model thinks (best-effort).
    await discordApi(`/channels/${input.channelId}/typing`, { method: "POST" }).catch(() => {});

    // runAssistant fetches the thin recent-channel slice itself (same path as
    // /udm); we just tell it which message to exclude — the @mention itself,
    // which is already the USER MESSAGE.
    const reply = await runAssistant({
      userId: user.id,
      text: input.text,
      sourceMessage: input.sourceMessage,
      channelId: input.channelId,
      excludeMessageId: input.messageId,
      surface: "mention",
    });
    await postChannel(input.channelId, `<@${input.discordUserId}> ${reply}`);
  } catch (err) {
    console.error("[discord] gateway handleMention failed", err);
  }
}

async function postChannel(channelId: string, content: string) {
  // A long reply becomes several in-order messages instead of one truncated one.
  for (const part of splitForDiscord(content)) {
    await discordApi(`/channels/${channelId}/messages`, {
      method: "POST",
      body: {
        content: part,
        // Only ping the user we're replying to — never @everyone / roles.
        allowed_mentions: { parse: ["users"] },
      },
    }).catch((err) => console.error("[discord] gateway post failed", err));
  }
}
