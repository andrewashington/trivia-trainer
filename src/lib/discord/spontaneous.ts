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

const KIND = z.enum(["poll", "tierlist", "prediction", "reveal", "idea", "image"]);
const SpontaneousOut = z.object({
  intro: z.string().min(1).max(400),
  kind: KIND,
  question: z.string().max(300).optional(),
  options: z.array(z.string().min(1).max(100)).max(8).optional(),
  title: z.string().max(200).optional(),
  items: z.array(z.string().min(1).max(120)).max(12).optional(),
  text: z.string().max(500).optional(),
  resolveInDays: z.coerce.number().int().min(1).max(365).optional(),
  ideaTitle: z.string().max(300).optional(),
  ideaDetail: z.string().max(1000).optional(),
  imagePrompt: z.string().max(600).optional(),
  caption: z.string().max(300).optional(),
});
type SpontaneousOut = z.infer<typeof SpontaneousOut>;

const SYSTEM = `You are UDM+, the resident AI gremlin of a tight friend group, posting UNPROMPTED into their Discord to keep things fun. Your job: invent ONE genuinely entertaining, engaging piece of content and a short intro line for it.

Pick what's fun, not what's obvious:
- Favor TOPICS, CONCEPTS, hypotheticals, debates, pop culture, and the group's shared interests — NOT a literal riff on the most recent message (which is often mundane), and NOT defaulting to polls "about people". A poll about pizza toppings or a tier list of movie villains beats yet another "who's most likely to…".
- Use the inspiration as flavor and lore (inside jokes, running bits, who likes what), but the content itself should stand on its own and spark replies.
- Vary the format. Across posts you should range over polls, tier lists, predictions, reveals, ideas, and the occasional image.

Output JSON for exactly one piece:
- intro: 1-2 sentence lead-in, in your voice (dry, ironic, a little unhinged, lowercase-casual fine). This is what you SAY when you drop it.
- kind: one of poll | tierlist | prediction | reveal | idea | image
- poll: { question, options: 2-6 short choices }
- tierlist: { title, items: 4-12 things to rank }
- prediction: { text (a falsifiable prediction), resolveInDays (when it can be judged) }
- reveal: a blind-rank game → { title, items: 3-8 things everyone ranks privately }
- idea: { ideaTitle, ideaDetail } — a genuinely fun thing for the group to do
- image: { imagePrompt (vivid art prompt — make it funny/striking, can nod to group lore), caption }

Make it land. Be specific and a little weird. No @everyone, no pinging.`;

/** Cached id of the bot's own User row (lazy-created). */
let botUserId: string | null = null;
async function systemUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const u = await db.user.upsert({
    where: { email: "bot@udmplus.local" },
    update: {},
    create: { email: "bot@udmplus.local", displayName: "UDM+", role: "member" },
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

/** Run the create runner for the chosen text-content kind. */
async function createContent(out: SpontaneousOut, uid: string): Promise<boolean> {
  const run = TOOL_RUNNERS;
  try {
    if (out.kind === "poll" && out.question && (out.options?.length ?? 0) >= 2) {
      await run.create_poll(uid, { question: out.question, options: out.options });
      return true;
    }
    if (out.kind === "tierlist" && out.title && (out.items?.length ?? 0) >= 2) {
      await run.create_tierlist(uid, { title: out.title, items: out.items });
      return true;
    }
    if (out.kind === "prediction" && out.text) {
      const days = out.resolveInDays ?? 7;
      const resolvesAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await run.create_stake(uid, { text: out.text, resolvesAt, hidden: false });
      return true;
    }
    if (out.kind === "reveal" && out.title && (out.items?.length ?? 0) >= 2) {
      await run.create_reveal(uid, { type: "rank", title: out.title, items: out.items });
      return true;
    }
    if (out.kind === "idea" && out.ideaTitle) {
      await run.create_idea(uid, { title: out.ideaTitle, detail: out.ideaDetail });
      return true;
    }
  } catch (err) {
    console.error("[discord] spontaneous createContent failed", err);
  }
  return false;
}

/** Generate an image, store it in the photobook, and post it inline. */
async function postImage(out: SpontaneousOut, uid: string, channelId: string): Promise<boolean> {
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

/** Generate + post one spontaneous piece. Exposed for an admin "post now" button. */
export async function runSpontaneousPost(): Promise<string> {
  const { channelId } = botConfig();
  if (!channelId) return "No channel configured.";
  if (!aiConfigured()) return "AI not configured.";

  const uid = await systemUserId();
  const inspiration = await gatherInspiration(channelId);

  const out = await chatJSON({
    system: SYSTEM,
    user: `INSPIRATION:\n${inspiration || "(quiet in here — invent something fun from the group's vibe)"}\n\nInvent one piece now. Return the JSON.`,
    schema: SpontaneousOut,
    maxTokens: 700,
  });

  if (out.kind === "image") {
    const ok = await postImage(out, uid, channelId);
    if (ok) return `posted image: ${out.imagePrompt?.slice(0, 60)}`;
    // image failed → fall through to a text poll fallback below
  } else {
    // Intro first, then the content card follows via the drainer (~30s).
    await postText(channelId, out.intro);
    const ok = await createContent(out, uid);
    if (ok) return `posted ${out.kind}`;
  }

  // Fallback: if the chosen kind couldn't be built, drop the intro as a message.
  await postText(channelId, out.intro).catch(() => {});
  return `posted intro only (kind ${out.kind} unbuildable)`;
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
