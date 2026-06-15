import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatJSON, aiConfigured } from "@/lib/ai";
import { getConfig, setConfig } from "@/lib/appConfig";
import { getGameKnobsCached } from "@/lib/knobs";
import { getDiscordSettings } from "@/lib/discord/settings";
import { botConfig, discordApi } from "@/lib/discord/bot";
import { fetchRecentMessages } from "@/lib/discord/history";
import { searchArchiveMessages } from "@/lib/discord/archive";
import { embedQuery } from "@/lib/discord/embeddings";
import { TOOL_RUNNERS } from "@/lib/discord/actions";
import { generateImage } from "@/lib/discord/image";
import { withOutbox } from "@/lib/outbox";
import { putObject } from "@/lib/storage";

/**
 * The bot's muse. Roughly every ~6h (jittered) it wakes up, soaks in a wide,
 * deliberately-varied pool of inspiration (recent chatter + random archive
 * digs + group interests + members + open ideas), then INVENTS one engaging
 * thing — a poll, tier list, prediction, reveal, idea, or an AI image — and
 * posts it with a little intro. It's steered to riff on TOPICS and CONCEPTS the
 * group cares about, not just echo the latest mundane message or always poll
 * about people.
 */

// Topic seeds — the group's flavor. Mixed with live archive channels + members.
const INTEREST_SEEDS = [
  "love island", "reality tv", "movies we should watch", "best restaurants", "video games",
  "music recommendations", "crypto", "fitness", "travel plans", "hot takes", "conspiracy theories",
  "would you rather", "underrated snacks", "worst takes", "group trips", "disney", "minecraft",
  "books", "cooking experiments", "sports", "memes", "nostalgia", "guilty pleasures",
];

const base = { intro: z.string().min(1).max(400) };
const SpontaneousOut = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("poll"),       question: z.string().min(1).max(300), options: z.array(z.string().min(1).max(100)).min(2).max(8) }),
  z.object({ ...base, kind: z.literal("tierlist"),   title: z.string().min(1).max(200),    items: z.array(z.string().min(1).max(120)).min(2).max(12) }),
  z.object({ ...base, kind: z.literal("reveal"),     title: z.string().min(1).max(200),    items: z.array(z.string().min(1).max(120)).min(2).max(8) }),
  z.object({ ...base, kind: z.literal("prediction"), text: z.string().min(1).max(500),     resolveInDays: z.coerce.number().int().min(1).max(365) }),
  z.object({ ...base, kind: z.literal("idea"),       ideaTitle: z.string().min(1).max(300), ideaDetail: z.string().max(1000).optional() }),
  z.object({ ...base, kind: z.literal("challenge"),  title: z.string().min(1).max(200),    description: z.string().max(1000).optional(), deadlineDays: z.coerce.number().int().min(1).max(30).optional() }),
  z.object({ ...base, kind: z.literal("post"),       body: z.string().min(1).max(1800) }),
  z.object({ ...base, kind: z.literal("image"),      imagePrompt: z.string().min(1).max(600), caption: z.string().max(300).optional() }),
]);
type SpontaneousOut = z.infer<typeof SpontaneousOut>;

export const SPONTANEOUS_SYSTEM_DEFAULT = `You are UDM+, the keeper of a tight friend group's record, posting UNPROMPTED into their Discord. Your job: invent ONE genuinely entertaining piece of content. You are the one writing and posting it — own the voice, the perspective, the craft.

Pick what's interesting, not what's safe:
- Pull real threads from the archive: a recurring debate, a pattern you've noticed, a running bit. The best posts feel like they came from someone who's been paying attention.
- Vary the format widely. Not everything needs to be a poll. A "post" (free-form text you write) can be a hot take, a mini-ranking essay, a fictional scenario, a dramatic retelling of an archived argument, a thought you had, an observation. Use it when a structured format would kill what you're trying to say.
- Challenges work when you want the group to DO something, not just vote. Set a real deadline and make the prompt specific.
- Favor topics, debates, hypotheticals, and pop culture the group cares about over mundane chat riffs or polls about people.

Output JSON for exactly one piece. Every field listed is REQUIRED — a missing field means nothing posts:

- poll:       { "kind":"poll",       "intro":"…", "question":"…", "options":["…","…","…"] }
- tierlist:   { "kind":"tierlist",   "intro":"…", "title":"…",    "items":["…","…","…","…"] }
- prediction: { "kind":"prediction", "intro":"…", "text":"…",     "resolveInDays":30 }
- reveal:     { "kind":"reveal",     "intro":"…", "title":"…",    "items":["…","…","…"] }
- idea:       { "kind":"idea",       "intro":"…", "ideaTitle":"…","ideaDetail":"…" }
- challenge:  { "kind":"challenge",  "intro":"…", "title":"…",    "description":"…", "deadlineDays":7 }
- post:       { "kind":"post",       "intro":"…", "body":"…" }
- image:      { "kind":"image",      "intro":"…", "imagePrompt":"…" }

intro: what you SAY when you drop it (1–2 sentences, dry, precise, lowercase-casual).
post body: the actual thing you're writing — a take, a ranking, an observation, a bit. Write it fully; don't summarize it.
poll options: 2–6 short choices. tierlist/reveal items: 4–12. prediction: falsifiable, specific, with a real timeframe.

No @everyone, no pinging.`;

/** Cached id of the bot's own User row (lazy-created). */
let botUserId: string | null = null;
async function systemUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const u = await db.user.upsert({
    where: { email: "bot@udmplus.local" },
    update: { isSystem: true },
    create: { email: "bot@udmplus.local", displayName: "UDM+", role: "member", isSystem: true },
    select: { id: true },
  });
  botUserId = u.id;
  return botUserId;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
}

/** Build the varied inspiration blob. Deliberately wide so a boring chat lull
 *  doesn't starve it — random archive digs + interests carry it. */
async function gatherInspiration(channelId: string | null): Promise<string> {
  const parts: string[] = [];

  if (channelId) {
    const recent = await fetchRecentMessages(channelId, 20).catch(() => []);
    if (recent.length) {
      parts.push(`RECENT CHATTER (context, don't just riff on it):\n${recent.map((m) => `${m.author}: ${m.text}`).join("\n").slice(0, 1500)}`);
    }
  }

  // Random archive digs on a mix of interest seeds + live channel topics.
  const channels = await db.$queryRaw<{ name: string | null }[]>`
    SELECT name FROM discord_archive.channels WHERE name IS NOT NULL ORDER BY random() LIMIT 4
  `.catch(() => []);
  const channelTopics = channels.map((c) => (c.name ?? "").replace(/-/g, " ")).filter(Boolean);
  const seeds = pickRandom([...INTEREST_SEEDS, ...channelTopics], 3);
  for (const seed of seeds) {
    const emb = await embedQuery(seed).catch(() => null);
    const hits = await searchArchiveMessages({ query: seed, queryEmbedding: emb ?? undefined, limit: 3 }).catch(() => []);
    if (hits.length) {
      parts.push(`ARCHIVE DIG — "${seed}":\n${hits.map((h) => h.text).join("\n").slice(0, 900)}`);
    }
  }

  const [members, ideas] = await Promise.all([
    db.user.findMany({ select: { displayName: true }, take: 40 }).catch(() => []),
    db.idea.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 6, select: { title: true } }).catch(() => []),
  ]);
  if (members.length) parts.push(`MEMBERS: ${members.map((m) => m.displayName).join(", ")}`);
  if (ideas.length) parts.push(`OPEN IDEAS: ${ideas.map((i) => i.title).join("; ")}`);

  return parts.join("\n\n");
}

/**
 * Build the chosen content. Resilient on purpose: the model sometimes picks a
 * kind but fills the wrong field (e.g. puts a poll's choices in `items`), so we
 * normalize field variants and, if the chosen kind can't be built, fall back to
 * whatever IS present — so we virtually always post real content, not just an
 * intro. Returns the kind built, or throws with a reason.
 */
async function createContent(out: SpontaneousOut, uid: string): Promise<string> {
  const run = TOOL_RUNNERS;
  switch (out.kind) {
    case "poll":
      await run.create_poll(uid, { question: out.question, options: out.options.slice(0, 6) });
      return "poll";
    case "tierlist":
      await run.create_tierlist(uid, { title: out.title, items: out.items });
      return "tierlist";
    case "reveal":
      await run.create_reveal(uid, { type: "rank", title: out.title, items: out.items });
      return "reveal";
    case "prediction": {
      const resolvesAt = new Date(Date.now() + out.resolveInDays * 864e5).toISOString();
      await run.create_stake(uid, { text: out.text, resolvesAt, hidden: false });
      return "prediction";
    }
    case "idea":
      await run.create_idea(uid, { title: out.ideaTitle, detail: out.ideaDetail });
      return "idea";
    case "challenge":
      await run.create_challenge(uid, { title: out.title, description: out.description, deadlineDays: out.deadlineDays ?? 7 });
      return "challenge";
    default:
      throw new Error(`unexpected kind: ${(out as SpontaneousOut).kind}`);
  }
}

/** Generate an image, store it in the photobook, and post it inline. */
async function postImage(out: Extract<SpontaneousOut, { kind: "image" }>, uid: string, channelId: string): Promise<boolean> {
  const prompt = out.imagePrompt;
  if (!prompt) return false;
  const img = await generateImage(prompt);
  if (!img) return false;

  const ext = img.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const storageKey = `photobook/${randomUUID()}-spontaneous.${ext}`;
  await putObject(storageKey, img.buffer, img.mimeType);
  const caption = out.caption || out.intro;

  await withOutbox(
    async (tx) => {
      const file = await tx.fileObject.create({
        data: { uploaderId: uid, filename: "UDM+ generated", mimeType: img.mimeType, sizeBytes: img.buffer.length, storageKey },
      });
      return tx.photobookPhoto.create({ data: { uploaderId: uid, fileId: file.id, caption } });
    },
    (p) => ({ type: "photobook.photo.added", payload: { photoId: p.id, uploaderId: uid, caption } }),
  ).catch((err) => console.error("[discord] spontaneous photobook save failed", err));

  // Post the image inline to the channel (multipart) so it shows immediately.
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: `${out.intro}\n_(also saved to the photobook 📸)_` }));
  form.append("files[0]", new Blob([new Uint8Array(img.buffer)], { type: img.mimeType }), `udm.${ext}`);
  await discordApi(`/channels/${channelId}/messages`, { method: "POST", body: form });
  return true;
}

async function postText(channelId: string, content: string): Promise<void> {
  await discordApi(`/channels/${channelId}/messages`, { method: "POST", body: { content: content.slice(0, 1900) } });
}

// In-flight guard: a spontaneous post takes several seconds (LLM + maybe image);
// a double-click or overlapping trigger must not produce two posts.
let posting = false;

/**
 * Generate + post one spontaneous piece. Exposed for the admin "post now"
 * button, the scheduler, and the assistant's create_something tool.
 * - channelOverride: post into a specific channel (the tool's source channel).
 * - postIntro: post the bot's intro line as its own message. The conversation
 *   tool sets this false because the assistant's own reply already leads in,
 *   so we'd otherwise double up.
 */
export async function runSpontaneousPost(
  channelOverride?: string | null,
  opts: { postIntro?: boolean } = {},
): Promise<string> {
  const channelId = channelOverride || botConfig().channelId;
  if (!channelId) return "No channel configured.";
  if (!aiConfigured()) return "AI not configured.";
  if (posting) return "already working on one";
  posting = true;
  try {
    const postIntro = opts.postIntro !== false;
    const uid = await systemUserId();
    const inspiration = await gatherInspiration(channelId);

    const promptSettings = await getDiscordSettings();
    const out = await chatJSON({
      system: promptSettings.aiPromptSpontaneous.trim() || SPONTANEOUS_SYSTEM_DEFAULT,
      user: `INSPIRATION:\n${inspiration || "(quiet in here — invent something fun from the group's vibe)"}\n\nInvent one piece now. Return the JSON.`,
      schema: SpontaneousOut,
      maxTokens: 700,
    });

    // Image: post inline and we're done — no separate intro.
    if (out.kind === "image") {
      if (await postImage(out, uid, channelId)) return `image: ${out.imagePrompt?.slice(0, 60)}`;
      // image gen failed — fall through and try to post a text piece instead.
    }

    // Post: free-form text written by the bot; posted directly, no app card.
    if (out.kind === "post") {
      await postText(channelId, out.body);
      return "post";
    }

    // Build the content first; only post the intro if it actually built — a
    // failure must never leave a dangling intro with no card behind it.
    try {
      const built = await createContent(out, uid);
      if (postIntro) await postText(channelId, out.intro);
      return `posted ${built}`;
    } catch (err) {
      console.error("[discord] spontaneous build failed; out =", JSON.stringify(out).slice(0, 500), err);
      return `build failed (no intro posted): ${err instanceof Error ? err.message : err}`;
    }
  } finally {
    posting = false;
  }
}

/**
 * Scheduler entry point. Fires on the ~6h (jittered) cadence, tracked in
 * AppConfig so it survives restarts. Reschedules BEFORE running so a failure
 * can't cause a retry storm.
 */
export async function maybeRunSpontaneous(): Promise<void> {
  const settings = await getDiscordSettings();
  if (!settings.spontaneousEnabled || !botConfig().canPost || !aiConfigured()) return;

  const knobs = await getGameKnobsCached("discord");
  const hours = Math.max(1, Number(knobs.spontaneousHours ?? 6));
  const now = Date.now();
  const cfg = await getConfig<{ nextAt?: number }>("discord.spontaneous");

  const jitter = () => Math.round(hours * (0.7 + Math.random() * 0.6) * 60 * 60 * 1000); // ±30%
  if (!cfg?.nextAt) {
    // First boot: schedule the first one a partial interval out, not immediately.
    await setConfig("discord.spontaneous", { nextAt: now + jitter() });
    return;
  }
  if (now < cfg.nextAt) return;

  await setConfig("discord.spontaneous", { nextAt: now + jitter() });
  try {
    const result = await runSpontaneousPost();
    console.log(`[discord] spontaneous: ${result}`);
  } catch (err) {
    console.error("[discord] spontaneous post failed", err);
  }
}
