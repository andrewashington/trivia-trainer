import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Badge, Card } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";
import type { AuthorIdentity } from "../identity";
import type { FameMessage } from "../queries";
import type { Superlative } from "../superlatives";
import { compact, full, shortDate, discordLink } from "../format";

export function profileHref(authorId: string): string {
  return `/discord-stats/people/${authorId}`;
}

/** Big-number tile for overview/profile headers. */
export function StatTile({
  label,
  value,
  sub,
  icon,
  accent = "bg-card",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: IconName;
  accent?: string;
}) {
  return (
    <div className={`brutal-card p-4 ${accent}`}>
      <div className="flex items-center gap-2 text-ink/60">
        {icon && <PixelIcon name={icon} size={14} />}
        <span className="brutal-label">{label}</span>
      </div>
      <p className="mt-1 font-display text-3xl font-bold leading-none tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink/55">{sub}</p>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">{children}</h2>
  );
}

/** Avatar + name that links to the author's stats profile. */
export function AuthorChip({
  identity,
  size = "sm",
  className = "",
}: {
  identity: AuthorIdentity;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Link
      href={profileHref(identity.authorId)}
      className={`inline-flex items-center gap-2 text-ink no-underline hover:text-accent-blurple ${className}`}
    >
      <Avatar name={identity.name} src={identity.avatarUrl} size={size} />
      <span className="font-display font-bold leading-tight">{identity.name}</span>
    </Link>
  );
}

export type BarItem = {
  identity: AuthorIdentity;
  value: number;
  display?: string;
};

/** Ranked horizontal bars (leaderboard previews + channel top posters). */
export function BarList({ items, accent = "bg-accent-blurple" }: { items: BarItem[]; accent?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <Link
          key={it.identity.authorId}
          href={profileHref(it.identity.authorId)}
          className="block no-underline text-ink"
        >
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right font-mono text-xs font-bold text-ink/40">
              {i + 1}
            </span>
            <Avatar name={it.identity.name} src={it.identity.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-sm font-bold">{it.identity.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-ink/70">
                  {it.display ?? full(it.value)}
                </span>
              </div>
              <div className="mt-0.5 h-2 border border-ink bg-paper">
                <div className={`h-full ${accent}`} style={{ width: `${(it.value / max) * 100}%` }} />
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** A hall-of-fame / quoted message card. */
export function MessageCard({
  msg,
  identity,
}: {
  msg: FameMessage;
  identity: AuthorIdentity;
}) {
  const link = discordLink(msg.guildId, msg.channelId, msg.messageId);
  const body = (msg.content || "").trim() || "(an image, apparently)";
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <AuthorChip identity={identity} />
        <Badge className="bg-accent-blurple text-white shrink-0">❤ {msg.reactionCount}</Badge>
      </div>
      <p className="whitespace-pre-wrap break-words font-body text-sm leading-snug">{body}</p>
      <p className="font-mono text-[11px] uppercase text-ink/50">
        {msg.channelName ? `#${msg.channelName}` : "?"} · {shortDate(msg.sentAt)}
        {link && (
          <>
            {" · "}
            <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
              jump ↗
            </a>
          </>
        )}
      </p>
    </Card>
  );
}

export function SuperlativeCard({
  award,
  identity,
}: {
  award: Superlative;
  identity: AuthorIdentity;
}) {
  return (
    <Link href={profileHref(award.authorId)} className="block no-underline text-ink">
      <div className="brutal-card h-full p-3 transition-transform hover:-translate-y-1">
        <div className="flex items-center gap-1.5 text-ink/70">
          <PixelIcon name={award.icon} size={14} />
          <span className="brutal-label">{award.title}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Avatar name={identity.name} src={identity.avatarUrl} size="sm" />
          <span className="truncate font-display font-bold">{identity.name}</span>
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tabular-nums text-accent-blurple">
          {award.stat}
        </p>
        <p className="mt-1 text-xs italic text-ink/60">{award.blurb}</p>
      </div>
    </Link>
  );
}

/** "Not built yet" prompt for the embedding/LLM-powered surfaces. */
export function NeedsBuild({ what }: { what: string }) {
  return (
    <Card className="bg-paper text-center">
      <div className="flex justify-center text-ink/40">
        <PixelIcon name="loader" size={36} />
      </div>
      <p className="mt-2 font-display font-bold">{what} isn&apos;t built yet</p>
      <p className="mt-1 text-sm text-ink/60">
        An admin needs to run <span className="font-mono">Rebuild insights</span> from the admin
        panel to crunch the embeddings.
      </p>
    </Card>
  );
}

/** Compact stat used inside profile/channel headers. */
export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-2 border-ink bg-card px-3 py-1.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink/50">{label}</p>
      <p className="font-display text-lg font-bold leading-tight tabular-nums">{value}</p>
    </div>
  );
}

export { compact, full };
