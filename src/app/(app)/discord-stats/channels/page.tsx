import Link from "next/link";
import { Card } from "@/components/ui";
import { getChannelLeaderboard } from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { AuthorChip, SectionTitle } from "@/modules/discord-stats/components/parts";
import { full, shortDate } from "@/modules/discord-stats/format";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const channels = await getChannelLeaderboard();
  const ids = await resolveIdentities(
    channels
      .filter((c) => c.topAuthorId)
      .map((c) => ({ authorId: c.topAuthorId!, authorName: c.topAuthorName ?? "?" })),
  );
  const max = Math.max(1, ...channels.map((c) => c.messages));

  return (
    <div className="space-y-4">
      <SectionTitle>Every channel, by volume</SectionTitle>
      <div className="space-y-2">
        {channels.map((c) => (
          <Card key={c.channelId}>
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/discord-stats/channels/${c.channelId}`}
                className="min-w-0 flex-1 no-underline text-ink"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-display font-bold">#{c.name ?? c.channelId}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-accent-blurple">
                    {full(c.messages)}
                  </span>
                </div>
                <div className="mt-1 h-2.5 border border-ink bg-paper">
                  <div className="h-full bg-accent-blurple" style={{ width: `${(c.messages / max) * 100}%` }} />
                </div>
                <p className="mt-1 font-mono text-[11px] uppercase text-ink/45">
                  {c.authors} people · last active {c.lastAt ? shortDate(c.lastAt) : "—"}
                </p>
              </Link>
              {c.topAuthorId && ids.get(c.topAuthorId) && (
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="font-mono text-[10px] uppercase text-ink/40">top poster</p>
                  <AuthorChip identity={ids.get(c.topAuthorId)!} />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
