import { getLeaderboard } from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { Leaderboards, type LeaderView } from "@/modules/discord-stats/components/Leaderboards";
import { SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const leaders = await getLeaderboard();
  const ids = await resolveIdentities(
    leaders.map((l) => ({ authorId: l.authorId, authorName: l.authorName })),
  );
  const rows: LeaderView[] = leaders.map((l) => {
    const id = ids.get(l.authorId)!;
    return {
      authorId: l.authorId,
      name: id.name,
      avatarUrl: id.avatarUrl,
      messages: l.messages,
      reactionsReceived: l.reactionsReceived,
      reactionRate: l.reactionRate,
      avgLen: l.avgLen,
      channels: l.channels,
    };
  });

  return (
    <div className="space-y-4">
      <SectionTitle>The leaderboard · pick your metric</SectionTitle>
      <Leaderboards rows={rows} />
      <p className="font-mono text-[11px] uppercase text-ink/40">
        Only authors with 20+ messages shown. Tap anyone for their dossier.
      </p>
    </div>
  );
}
