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
import { getTopicClusters } from "@/modules/discord-stats/insights";
import { getHallOfFame, getLeaderboard, getNightOwls, getConnectorLeaders } from "@/modules/discord-stats/queries";
import { computeSuperlatives } from "@/modules/discord-stats/superlatives";

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

Pull real threads from the inspiration below: a recurring debate, a pattern you've noticed, a running bit, a topic cluster the group actually cares about, a hall-of-fame moment worth revisiting. The best posts feel like they came from someone who's been paying attention — not like a random content generator.

---

## Formats — pick the right tool

**poll** — A question where group opinion IS the answer and reasonable people land differently. Best for genuine debates with no clear winner: "is a hot dog a sandwich," "pineapple: yes or no," "best season of Love Island." Bad: anything with an obvious answer, anything just asking "who's most likely to X" about people.
→ write 2–6 short options, no filler choices

**tierlist** — 4–12 items the group will disagree about ranking. Great for pop culture (movie villains, Disney eras, pizza toppings), recurring group references, things the archive shows them fighting about. Everyone ranks individually and the results aggregate. Use when the ordering is the whole game.
→ items should be specific enough to rank, not so vague they're all the same tier

**reveal** — Like tierlist but the SURPRISE is what makes it work: everyone ranks blind, results revealed together. Best when you want to expose how misaligned (or weirdly aligned) the group is. "rank these Love Island contestants worst to best" or "rank these travel destinations you'd actually go to." The reveal is the payoff.
→ 3–8 items, pick things where you genuinely don't know how people will sort them

**prediction** — A specific falsifiable claim about the future, with a real resolution date. The model's own call: don't hedge. "toby goes home before top 5," "the group will not finish a single book club book this year." Bad: vague statements that can't be judged. Good: anything you could look up in 30 days and say yes or no.
→ text is the claim itself; resolveInDays is when it can actually be judged (7–90 is realistic)

**challenge** — A prompt for the group to DO something and submit proof (text or photo). Works best when the task is specific, achievable, and has mild creative room: "cook something you've never made before," "photo of your current desk right now," "draw [recurring topic from archive] from memory in 60 seconds." Set a deadline that's real (3–7 days).
→ description can add rules or context; the title should be the actual challenge prompt

**post** — Free-form text you write. Use this when the insight or observation is the content and a structured format would kill it: a hot take on something from the archive, a dramatic ranking of things you noticed, a mini-essay, a fictional retelling of a past argument, a pattern observation that deserves a paragraph. Write the body fully — this IS what gets posted, not a summary of it.
→ body is the actual text (up to 1800 chars); intro is the one-line lead-in before it

**image** — AI-generated art. Use for visual humor, absurd hypotheticals, or things the group would find funny to see rendered. The imagePrompt should be vivid, specific, and a little unhinged — referencing group lore when it fits.
→ imagePrompt needs to stand alone as an art direction; caption is optional

---

Output JSON for exactly one piece. Every field listed for the chosen kind is REQUIRED — a missing field means nothing posts:

- poll:       { "kind":"poll",       "intro":"…", "question":"…", "options":["…","…"] }
- tierlist:   { "kind":"tierlist",   "intro":"…", "title":"…",    "items":["…","…","…","…"] }
- prediction: { "kind":"prediction", "intro":"…", "text":"…",     "resolveInDays":14 }
- reveal:     { "kind":"reveal",     "intro":"…", "title":"…",    "items":["…","…","…"] }
- idea:       { "kind":"idea",       "intro":"…", "ideaTitle":"…","ideaDetail":"…" }
- challenge:  { "kind":"challenge",  "intro":"…", "title":"…",    "description":"…", "deadlineDays":7 }
- post:       { "kind":"post",       "intro":"…", "body":"…" }
- image:      { "kind":"image",      "intro":"…", "imagePrompt":"…" }

intro: what you SAY when you drop it (1–2 sentences, dry, lowercase-casual, written as yourself).
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

  const [members, ideas, clusters, fame, leaders, owls, connectors] = await Promise.all([
    db.user.findMany({ select: { displayName: true }, take: 40 }).catch(() => []),
    db.idea.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 6, select: { title: true } }).catch(() => []),
    getTopicClusters().catch(() => []),
    getHallOfFame({ limit: 5 }).catch(() => []),
    getLeaderboard().catch(() => []),
    getNightOwls().catch(() => []),
    getConnectorLeaders().catch(() => []),
  ]);

  if (members.length) parts.push(`MEMBERS: ${members.map((m) => m.displayName).join(", ")}`);
  if (ideas.length) parts.push(`OPEN IDEAS: ${ideas.map((i) => i.title).join("; ")}`);

  if (clusters.length) {
    const top = clusters.slice(0, 8).map((c) => `"${c.label}" — ${c.summary}`).join("\n");
    parts.push(`WHAT THIS GROUP TALKS ABOUT (topic clusters from the full archive):\n${top}`);
  }

  if (fame.length) {
    const lines = fame.map((m) =>
      `${m.authorName} (${m.reactionCount} reactions, ${m.sentAt.toISOString().slice(0, 10)}): "${m.content.slice(0, 120)}"`
    ).join("\n");
    parts.push(`HALL OF FAME — most-reacted messages ever:\n${lines}`);
  }

  const superlatives = computeSuperlatives({ leaders, nightOwls: owls, connectors, topFame: fame[0] ?? null });
  if (superlatives.length) {
    const lines = superlatives.map((s) => `${s.title}: ${s.authorName} (${s.stat})`).join("\n");
    parts.push(`GROUP SUPERLATIVES (character sketches — use for flavor, not just to make polls about people):\n${lines}`);
  }

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
