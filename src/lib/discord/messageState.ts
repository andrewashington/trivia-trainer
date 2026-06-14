import { db } from "@/lib/db";
import { discordApi, botConfig } from "@/lib/discord/bot";
import { editV2, patchCardComponents, textDisplay, CARD_IDS } from "@/lib/discord/components";

/**
 * Live-edit support for posted cards. A `DiscordMessageRef` ties an entity
 * (poll / listing / event / drop / coinflip) to the channel message that
 * mirrors it, so a later state change (RSVP count, CLAIMED, vote tally, drop
 * claimed, coinflip settled) can rewrite that same message in place.
 *
 * Both functions no-op cleanly when the bot is unconfigured or no ref exists.
 */

/** Remember (upsert) the message that mirrors an entity. */
export async function rememberMessage(
  kind: string,
  refId: string,
  channelId: string,
  messageId: string
): Promise<void> {
  await db.discordMessageRef.upsert({
    where: { kind_refId: { kind, refId } },
    create: { kind, refId, channelId, messageId },
    update: { channelId, messageId },
  });
}

/**
 * Update a tracked card in place. We GET the live message (so we keep its text
 * and the already-resolved CDN image url), replace only the status line and/or
 * the button row by their stable ids, then PATCH. No-op if the bot is off, the
 * card isn't tracked, or the message is gone.
 *
 * `patch.buttons`: an action-row object to swap in (must carry id CARD_IDS.buttons),
 * or `null` to drop the row. Omit to leave the buttons untouched.
 */
export async function editTrackedMessage(
  kind: string,
  refId: string,
  patch: { status?: string; buttons?: object | null }
): Promise<void> {
  if (!botConfig().canPost) return;
  const ref = await db.discordMessageRef.findUnique({ where: { kind_refId: { kind, refId } } });
  if (!ref) return;
  try {
    const res = await discordApi(`/channels/${ref.channelId}/messages/${ref.messageId}`, {
      method: "GET",
    });
    const msg = (await res.json()) as { components?: object[] };
    const replacements: Record<number, object | null> = {};
    if (patch.status !== undefined) {
      replacements[CARD_IDS.status] = { ...textDisplay(patch.status), id: CARD_IDS.status };
    }
    if (patch.buttons !== undefined) {
      replacements[CARD_IDS.buttons] = patch.buttons;
    }
    const next = patchCardComponents(msg.components ?? [], replacements);
    await editV2(ref.channelId, ref.messageId, next);
  } catch (err) {
    // A deleted message / closed channel shouldn't break the originating action.
    console.error(`[discord] editTrackedMessage failed for ${kind}:${refId}`, err);
  }
}
