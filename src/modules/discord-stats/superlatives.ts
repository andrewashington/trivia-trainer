import type { IconName } from "@/components/icons";
import type { LeaderRow, RepliedToRow, FameMessage } from "./queries";

/**
 * The UDMies — satirical, auto-computed awards derived purely from the already-
 * fetched aggregates (no extra queries). Rate-based awards use a message floor so
 * a 30-message lurker can't win "most beloved" on a fluke. Voice: over-the-top.
 */
export type Superlative = {
  key: string;
  title: string;
  icon: IconName;
  blurb: string;
  authorId: string;
  authorName: string;
  stat: string;
};

const RATE_FLOOR = 500; // min messages to qualify for per-message awards

export function computeSuperlatives(input: {
  leaders: LeaderRow[];
  nightOwls: { authorId: string; authorName: string; lateShare: number }[];
  repliedTo: RepliedToRow[];
  topFame: FameMessage | null;
}): Superlative[] {
  const { leaders, nightOwls, repliedTo, topFame } = input;
  const qualified = leaders.filter((l) => l.messages >= RATE_FLOOR);
  const out: Superlative[] = [];

  const max = <T>(arr: T[], score: (t: T) => number): T | null =>
    arr.length ? arr.reduce((best, x) => (score(x) > score(best) ? x : best)) : null;
  const min = <T>(arr: T[], score: (t: T) => number): T | null =>
    arr.length ? arr.reduce((best, x) => (score(x) < score(best) ? x : best)) : null;

  const add = (
    key: string,
    title: string,
    icon: IconName,
    blurb: string,
    row: { authorId: string; authorName: string } | null,
    stat: string,
  ) => {
    if (row) out.push({ key, title, icon, blurb, authorId: row.authorId, authorName: row.authorName, stat });
  };

  const yapper = max(leaders, (l) => l.messages);
  add("yapper", "The Yapper", "megaphone", "Simply could not stop talking.", yapper, yapper ? `${yapper.messages.toLocaleString()} messages` : "");

  const beloved = max(qualified, (l) => l.reactionRate);
  add("beloved", "Most Beloved", "heart", "Says something, the reactions rain down.", beloved, beloved ? `${beloved.reactionRate.toFixed(2)} reactions / msg` : "");

  const void_ = min(qualified, (l) => l.reactionRate);
  add("void", "Posting Into The Void", "moon", "Tireless. Unreacted to. A hero.", void_, void_ ? `${void_.reactionRate.toFixed(2)} reactions / msg` : "");

  const novelist = max(qualified, (l) => l.avgLen);
  add("novelist", "The Novelist", "book-open", "Never used one word where forty would do.", novelist, novelist ? `${novelist.avgLen} chars / msg avg` : "");

  const fewWords = min(qualified, (l) => l.avgLen);
  add("few-words", "Man Of Few Words", "check", "Brevity. The whole bit.", fewWords, fewWords ? `${fewWords.avgLen} chars / msg avg` : "");

  const replyGuy = max(leaders, (l) => l.repliesSent);
  add("reply-guy", "The Reply Guy", "arrows-horizontal", "Has an opinion on everything you said.", replyGuy, replyGuy ? `${replyGuy.repliesSent.toLocaleString()} replies sent` : "");

  const mainChar = repliedTo[0] ?? null;
  add("main-character", "The Main Character", "crown", "Everything orbits this person.", mainChar, mainChar ? `replied to ${mainChar.count.toLocaleString()} times` : "");

  const owl = nightOwls[0] ?? null;
  add("night-creature", "Night Creature", "moon", "Most active when sane people sleep.", owl, owl ? `${Math.round(owl.lateShare * 100)}% of posts after midnight` : "");

  const everywhere = max(leaders, (l) => l.channels);
  add("everywhere", "Everywhere At Once", "earth", "No channel is safe.", everywhere, everywhere ? `active in ${everywhere.channels} channels` : "");

  if (topFame) {
    out.push({
      key: "peaked",
      title: "Peaked",
      icon: "trophy",
      blurb: "The single most-reacted message in recorded history.",
      authorId: topFame.authorId,
      authorName: topFame.authorName,
      stat: `${topFame.reactionCount} reactions on one message`,
    });
  }

  return out;
}
