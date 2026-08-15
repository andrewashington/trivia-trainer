import { z } from "zod";
import { aiConfigured, chatJSON } from "@/lib/ai";
import { planDoc, type PlanDoc } from "@/modules/fitness/schema";

/**
 * The Forge: messy workout program in, structured draft out. Modeled on the
 * home-plus recipe normalizer — one fast JSON-mode call against a strict zod
 * schema, an editable draft returned to the client, and NOTHING persisted
 * here (saving is POST /api/fitness/plans, after the human approves).
 *
 * Never throws: with AI unconfigured (or twice-failed) it falls back to a
 * deterministic line parser, so a dead model can never block a save. The raw
 * paste always survives on the draft as sourceText.
 */

export type PlanDraft = {
  title: string;
  blurb: string | null;
  goal: string | null;
  daysPerWeek: number | null;
  equipment: string | null;
  doc: PlanDoc;
  sourceText: string | null;
  sourceUrl: string | null;
  aiUsed: boolean;
};

/** What the model must return — planDoc's days plus card metadata. */
const aiPlanReply = z.object({
  title: z.string().trim().min(1).max(160),
  blurb: z.string().trim().max(240).nullish(),
  goal: z.string().trim().max(60).nullish(),
  daysPerWeek: z.number().int().min(1).max(7).nullish(),
  equipment: z.string().trim().max(80).nullish(),
  days: planDoc.shape.days,
});

const PLAN_SYSTEM = `You turn messy workout programs (a pasted note, a bro-text, a coach's plan, a scraped page) into ONE clean structured program for a private friend-group fitness app. Reply with ONLY JSON:
{"title": string, "blurb": string|null, "goal": string|null, "daysPerWeek": number|null, "equipment": string|null,
 "days": [{"name": string, "focus": string|null,
   "blocks": [{"label": string|null,
     "exercises": [{"name": string, "sets": number|null, "reps": string|null, "load": string|null, "rest": string|null, "notes": string|null}]}]}]}

GLOSSARY — read the program like a lifter:
- "3x8-12" = 3 sets of 8-12 reps (sets: 3, reps: "8-12"). "5x5" = sets: 5, reps: "5".
- AMRAP = as many reps as possible (reps: "AMRAP"). EMOM/Tabata/circuits: keep the protocol in notes.
- "A1/A2" pairs or "SS"/"superset" = ONE block with label "Superset"; giant sets likewise. Plain straight sets = blocks with label null.
- RPE ("@8"), percentages ("70%"), tempo ("3-1-1"), and "top set/back-off" language belong in load or notes exactly as written.
- PPL = push/pull/legs. U/L = upper/lower. 5/3/1, GZCLP, PHUL, nSuns are named schemes — keep the name in the title or notes.
- Warm-ups, mobility, and cardio ARE exercises if the program lists them.

RULES:
- Every exercise line in the input appears exactly once. Each renders one-per-screen in workout mode, so a dropped exercise is a skipped lift — and nobody skips leg day on your watch.
- Preserve the author's numbers exactly. null beats wrong for EVERY field — never invent sets, loads, rest times, or training days that aren't in the input.
- reps/load/rest are strings: keep ranges and oddities as written ("8-12", "5+", "to failure", "bodyweight", "90s").
- days: one entry per training day, in the program's order, named like the program names them ("Day 1 — Push"). Skip rest days unless the program gives them content.
- blurb: ONE dry sentence for the card — what this program is and who it punishes. No hype, no exclamation points.
- goal only if the input implies it: "strength" | "hypertrophy" | "fat loss" | "conditioning" | "general".
- If the input has no workout program at all, still produce the most useful structure you can from what's there.`;

// ── Guarded URL reader ──────────────────────────────────────────────────────
// Same posture as the recipe scraper in home-plus: http(s) only, no
// localhost/private-looking hosts, short timeout, hard caps. The page text is
// model fodder, not rendered anywhere.

function isSafePlanUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (host.includes(":")) return false; // IPv6 literal
  return true;
}

async function fetchPageText(url: string): Promise<{ title: string | null; text: string } | null> {
  if (!isSafePlanUrl(url)) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "UDM+ (program forge)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    const og =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
      null;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&(nbsp|#160);/g, " ")
      .replace(/&(amp|#38);/g, "&")
      .replace(/&(lt|#60);/g, "<")
      .replace(/&(gt|#62);/g, ">")
      .replace(/&(quot|#34);/g, '"')
      .replace(/&(#39|apos);/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { title: og ? og.trim() : null, text };
  } catch {
    return null;
  }
}

// ── Deterministic fallback parser ───────────────────────────────────────────
// AI off or twice-failed → an honest rough cut. Day headers are lines like
// "Day 1", "Push:", "Monday — upper"; "3x8-12"-shaped lines become exercises;
// anything else on a training day becomes an exercise with just a name.

const DAY_HEADER =
  /^(day\s*\d+|week\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|push|pull|legs?|upper|lower|full\s*body|chest|back|shoulders|arms|core)\b/i;
const SETS_REPS = /^(.*?)[\s:–—-]*(\d{1,2})\s*[x×]\s*([\d][\d\-–+]*\S*)\s*(.*)$/i;

export function fallbackParse(text: string): PlanDoc {
  type Day = { name: string; focus: null; blocks: { label: null; exercises: { name: string; sets: number | null; reps: string | null; load: string | null; rest: null; notes: string | null }[] }[] };
  const days: Day[] = [];
  const dayFor = (): Day => {
    if (!days.length) days.push({ name: "Day 1", focus: null, blocks: [{ label: null, exercises: [] }] });
    return days[days.length - 1];
  };
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/^[\s•*\-–—\d.)]+(?=[A-Za-z])/, "").trim();
    if (!line) continue;
    const isHeader = (DAY_HEADER.test(line) && line.length <= 48) || (/:$/.test(line) && line.length <= 48);
    if (isHeader && days.length < 14) {
      days.push({ name: line.replace(/:$/, ""), focus: null, blocks: [{ label: null, exercises: [] }] });
      continue;
    }
    const m = line.match(SETS_REPS);
    const exercises = dayFor().blocks[0].exercises;
    if (exercises.length >= 20) continue;
    if (m && m[1].trim()) {
      exercises.push({
        name: m[1].trim().slice(0, 120),
        sets: Math.min(30, parseInt(m[2], 10)) || null,
        reps: m[3].slice(0, 40),
        load: null,
        rest: null,
        notes: m[4].trim() ? m[4].trim().slice(0, 300) : null,
      });
    } else if (line.length <= 120) {
      exercises.push({ name: line, sets: null, reps: null, load: null, rest: null, notes: null });
    }
  }
  const kept = days.filter((d) => d.blocks[0].exercises.length > 0);
  if (!kept.length) {
    return { days: [{ name: "Day 1", focus: null, blocks: [{ label: null, exercises: [{ name: "Untitled lift", sets: null, reps: null, load: null, rest: null, notes: null }] }] }] };
  }
  return { days: kept };
}

// ── The entry point ─────────────────────────────────────────────────────────

export async function normalizePlan(input: { text?: string | null; url?: string | null }): Promise<PlanDraft> {
  const pasted = (input.text ?? "").trim();
  const page = input.url ? await fetchPageText(input.url) : null;
  const material = [
    page?.title ? `PAGE TITLE: ${page.title}` : "",
    pasted,
    page?.text ?? "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 24_000);

  const fallbackTitle =
    page?.title?.slice(0, 160) ||
    pasted.split("\n").map((l) => l.trim()).find((l) => l.length > 0)?.slice(0, 160) ||
    "Untitled program";
  const fallback: PlanDraft = {
    title: fallbackTitle,
    blurb: null,
    goal: null,
    daysPerWeek: null,
    equipment: null,
    doc: fallbackParse(material || fallbackTitle),
    sourceText: pasted || page?.text?.slice(0, 50_000) || null,
    sourceUrl: input.url ?? null,
    aiUsed: false,
  };

  if (!aiConfigured() || material.length < 20) return fallback;
  try {
    const ai = await chatJSON({
      system: PLAN_SYSTEM,
      user: material,
      schema: aiPlanReply,
      maxTokens: 4000, // programs are long; the default would truncate real ones
    });
    return {
      title: ai.title,
      blurb: ai.blurb ?? null,
      goal: ai.goal ?? null,
      daysPerWeek: ai.daysPerWeek ?? ai.days.length ?? null,
      equipment: ai.equipment ?? null,
      doc: { days: ai.days },
      sourceText: fallback.sourceText,
      sourceUrl: input.url ?? null,
      aiUsed: true,
    };
  } catch (err) {
    console.error("[fitness] forge failed — falling back to the line parser:", err);
    return fallback;
  }
}
