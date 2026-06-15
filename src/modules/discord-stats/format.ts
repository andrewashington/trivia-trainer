/** Tiny formatting helpers shared across the Discord Stats UI. */

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function full(n: number): string {
  return n.toLocaleString();
}

/** "11pm", "3am", "noon", "midnight" from a 0–23 hour. */
export function hourLabel(h: number): string {
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  const am = h < 12;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${am ? "am" : "pm"}`;
}

export function shortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A loud, distinct palette for topic clusters / eras — reused by the galaxy and
 * the streamgraph so a cluster is the same color everywhere.
 */
export const CLUSTER_PALETTE = [
  "#2563FF", "#FF4D2E", "#FFD60A", "#3DDC4E", "#9B5DE5", "#00CFE8",
  "#FF6FB5", "#FF9F1C", "#16C2A3", "#B5E631", "#E0218A", "#6A5CFF",
  "#FF3366", "#0077B6", "#D633FF", "#FF7F50", "#C1440E", "#5865F2",
  "#E3A82B", "#2FBF71",
];

export function clusterColor(i: number): string {
  return CLUSTER_PALETTE[((i % CLUSTER_PALETTE.length) + CLUSTER_PALETTE.length) % CLUSTER_PALETTE.length];
}

/** Build a Discord deep-link to a message/segment when we know the guild. */
export function discordLink(
  guildId: string | null,
  channelId: string,
  messageId: string,
): string | null {
  return guildId ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : null;
}
