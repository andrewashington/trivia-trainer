import { db } from "@/lib/db";
import { discordApi, botConfig } from "@/lib/discord/bot";
import {
  editV2,
  editCardImageV2,
  patchCardComponents,
  textDisplay,
  mediaGallery,
  CARD_IDS,
} from "@/lib/discord/components";

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
    const msg = (await res.json()) as {
      components?: object[];
      attachments?: { id: string; filename?: string }[];
    };
    const replacements: Record<number, object | null> = {};
    if (patch.status !== undefined) {
      replacements[CARD_IDS.status] = { ...textDisplay(patch.status), id: CARD_IDS.status };
    }
    if (patch.buttons !== undefined) {
      replacements[CARD_IDS.buttons] = patch.buttons;
    }
    // Re-bind the card image to the retained upload via attachment://<name>: on
    // GET, Discord rewrites the mediaGallery url to a signed/expiring CDN link,
    // and a CV2 PATCH that omits `attachments` drops the upload entirely. Resend
    // the canonical attachment:// reference and keep the attachment with its id.
    const att = msg.attachments?.[0];
    if (att) {
      replacements[CARD_IDS.media] = {
        ...mediaGallery([{ url: `attachment://${att.filename ?? "card.png"}` }]),
        id: CARD_IDS.media,
      };
    }
    const next = patchCardComponents(msg.components ?? [], replacements);
    await editV2(ref.channelId, ref.messageId, next, att ? [{ id: att.id }] : undefined);
  } catch (err) {
    // A deleted message / closed channel shouldn't break the originating action.
    console.error(`[discord] editTrackedMessage failed for ${kind}:${refId}`, err);
  }
}

/**
 * Like editTrackedMessage, but ALSO swaps the card's image for a freshly-
 * rendered PNG (the status line comes along for the ride). Used when the
 * picture itself changes — The Book re-renders its bettor collage on each new
 * bet. Buttons and the link row are left untouched. No-op if unconfigured / the
 * card isn't tracked / the message is gone.
 */
export async function restyleTrackedCard(
  kind: string,
  refId: string,
  patch: { png: Buffer; status?: string }
): Promise<void> {
  if (!botConfig().canPost) return;
  const ref = await db.discordMessageRef.findUnique({ where: { kind_refId: { kind, refId } } });
  if (!ref) return;
  try {
    const res = await discordApi(`/channels/${ref.channelId}/messages/${ref.messageId}`, {
      method: "GET",
    });
    const msg = (await res.json()) as { components?: object[] };
    const replacements: Record<number, object | null> = {
      // Repoint the gallery at the new upload (editCardImageV2 sends the file).
      [CARD_IDS.media]: { ...mediaGallery([{ url: "attachment://card.png" }]), id: CARD_IDS.media },
    };
    if (patch.status !== undefined) {
      replacements[CARD_IDS.status] = { ...textDisplay(patch.status), id: CARD_IDS.status };
    }
    const next = patchCardComponents(msg.components ?? [], replacements);
    await editCardImageV2(ref.channelId, ref.messageId, next, patch.png);
  } catch (err) {
    console.error(`[discord] restyleTrackedCard failed for ${kind}:${refId}`, err);
  }
}
