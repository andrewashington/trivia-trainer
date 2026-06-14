import { discordApi, botConfig } from "@/lib/discord/bot";
import { moduleStyle, type CardSpec } from "@/lib/discord/feed";

/**
 * Components V2 builders + post/edit helpers.
 *
 * Components V2 (message flag 1<<15) replaces the embed model with a tree of
 * typed components: a `container` (type 17, the accent-bordered card body),
 * `textDisplay` (10, markdown), `section` (9, text + accessory), `mediaGallery`
 * (12, images — the home for our brutalist PNG), `separator` (14), `actionRow`
 * (1) and `button` (2). Footguns we honor:
 *   - the flag disables `content` / `embeds` / `poll` on that message;
 *   - attachments only render if a mediaGallery/file component references them
 *     via `attachment://<name>`;
 *   - ≤40 components and ≤4000 chars of text total;
 *   - the flag is irreversible once a message is created with it (so an edit
 *     re-sends it).
 * https://discord.com/developers/docs/components/reference
 */

export const IS_COMPONENTS_V2 = 1 << 15; // 32768

/**
 * Stable component ids for the live-editable parts of a tracked card. Every
 * child of a tracked card gets an explicit id (so Discord's auto-numbering
 * can't collide), and the dynamic `status` line + `buttons` row are replaced
 * by id on edit — see patchCardComponents / messageState.editTrackedMessage.
 */
export const CARD_IDS = {
  container: 1,
  header: 2,
  headline: 3,
  sub: 4,
  media: 5,
  status: 6,
  buttons: 7,
  link: 8,
} as const;

type Emoji = { id?: string; name?: string; animated?: boolean };

/** Container (type 17) — the accent-bordered card body that wraps everything. */
export const container = (opts: { accentColor?: number; components: object[] }) => ({
  type: 17,
  ...(opts.accentColor != null ? { accent_color: opts.accentColor } : {}),
  components: opts.components,
});

/** Text display (type 10) — markdown, including `#`/`##` headings and `**bold**`. */
export const textDisplay = (markdown: string) => ({ type: 10, content: markdown });

/** Section (type 9) — up to 3 text lines with a right-hand accessory (button or thumbnail). */
export const section = (opts: { text: string[]; accessory: object }) => ({
  type: 9,
  components: opts.text.map((t) => textDisplay(t)),
  accessory: opts.accessory,
});

/** Media gallery (type 12) — images by URL or `attachment://name`. */
export const mediaGallery = (items: { url: string; description?: string }[]) => ({
  type: 12,
  items: items.map((i) => ({
    media: { url: i.url },
    ...(i.description ? { description: i.description } : {}),
  })),
});

/** Separator (type 14) — vertical spacing, optionally with a divider line. */
export const separator = (divider = true) => ({ type: 14, divider });

/** Action row (type 1) — wraps up to 5 buttons or one select. */
export const actionRow = (...c: object[]) => ({ type: 1, components: c });

/** Button (type 2). Styles: 1 primary · 2 secondary · 3 success · 4 danger. */
export const button = (
  style: number,
  label: string,
  custom_id: string,
  opts?: { emoji?: Emoji; disabled?: boolean }
) => ({
  type: 2,
  style,
  label,
  custom_id,
  ...(opts?.emoji ? { emoji: opts.emoji } : {}),
  ...(opts?.disabled ? { disabled: true } : {}),
});

/** Link button (type 2, style 5) — opens a URL; carries no custom_id. */
export const linkButton = (label: string, url: string) => ({
  type: 2,
  style: 5,
  label,
  url,
});

/** Post a Components V2 message via the bot token. Returns the new message id. */
export async function postV2(
  channelId: string,
  components: object[],
  files?: { name: string; data: Buffer }[]
): Promise<{ messageId: string }> {
  const payload = { flags: IS_COMPONENTS_V2, components };
  let body: FormData | Record<string, unknown>;
  if (files?.length) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    files.forEach((f, i) => {
      form.append(
        `files[${i}]`,
        new Blob([new Uint8Array(f.data)], { type: "image/png" }),
        f.name
      );
    });
    body = form;
  } else {
    body = payload;
  }
  const res = await discordApi(`/channels/${channelId}/messages`, { method: "POST", body });
  const json = (await res.json()) as { id: string };
  return { messageId: json.id };
}

/** Edit a Components V2 message in place. The V2 flag is re-sent (it's irreversible). */
export async function editV2(
  channelId: string,
  messageId: string,
  components: object[]
): Promise<void> {
  await discordApi(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: { flags: IS_COMPONENTS_V2, components },
  });
}

/**
 * Replace components by id within a V2 container tree, preserving everything
 * else (text, the image with its resolved CDN url, the link button). A null
 * replacement drops that component. Used to live-edit a tracked card without
 * re-rendering the PNG or re-uploading the attachment.
 */
export function patchCardComponents(
  existing: object[],
  replacements: Record<number, object | null>
): object[] {
  return existing.map((top) => {
    const c = top as { type?: number; components?: object[] };
    if (c.type === 17 && Array.isArray(c.components)) {
      const children = c.components
        .map((child) => {
          const id = (child as { id?: number }).id;
          return id != null && id in replacements ? replacements[id] : child;
        })
        .filter((x): x is object => x != null);
      return { ...c, components: children };
    }
    return top;
  });
}

/**
 * Card glow-up: wrap the brutalist PNG (still rendered by card.tsx) in a V2
 * container with a kicker/headline textDisplay, the image in a mediaGallery,
 * the interactive components, and an "open in UDM+" link button. Posts to the
 * feed channel as the bot. When `kind`/`refId` are given, every child gets a
 * stable id and the message is remembered so the card can be live-edited later
 * (RSVP counts, CLAIMED, vote tallies).
 *
 * Returns the new message id, or null if the bot can't post.
 */
export async function postCardV2(opts: {
  spec: CardSpec;
  png: Buffer;
  components?: object[] | null;
  actorName?: string | null;
  statusLine?: string;
  kind?: string;
  refId?: string;
}): Promise<{ messageId: string } | null> {
  const { channelId, canPost } = botConfig();
  if (!canPost || !channelId) return null;

  const style = moduleStyle[opts.spec.module];
  const accent = parseInt(style.accent.slice(1), 16);
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const sub = opts.spec.sub.replace("{actor}", opts.actorName ?? "someone");
  const tracked = !!(opts.kind && opts.refId);
  const withId = <T extends object>(id: number, c: T): T => (tracked ? { ...c, id } : c);

  const inner: object[] = [
    withId(CARD_IDS.header, textDisplay(`**${style.label.toUpperCase()} · ${opts.spec.kicker}**`)),
    withId(CARD_IDS.headline, textDisplay(`## ${opts.spec.headline}`)),
    withId(CARD_IDS.sub, textDisplay(sub)),
    withId(CARD_IDS.media, mediaGallery([{ url: "attachment://card.png" }])),
  ];
  if (opts.statusLine) inner.push(withId(CARD_IDS.status, textDisplay(opts.statusLine)));
  if (opts.components?.length) {
    inner.push(withId(CARD_IDS.buttons, opts.components[0] as object), ...opts.components.slice(1));
  }
  if (base) inner.push(withId(CARD_IDS.link, actionRow(linkButton("Open in UDM+", `${base}${opts.spec.path}`))));

  const card = withId(CARD_IDS.container, container({ accentColor: accent, components: inner }));
  const { messageId } = await postV2(channelId, [card], [{ name: "card.png", data: opts.png }]);

  if (opts.kind && opts.refId) {
    const { rememberMessage } = await import("@/lib/discord/messageState");
    await rememberMessage(opts.kind, opts.refId, channelId, messageId);
  }

  return { messageId };
}
