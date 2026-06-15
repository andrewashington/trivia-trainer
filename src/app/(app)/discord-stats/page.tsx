import Link from "next/link";
import { HeroBanner, HeroCta } from "@/components/Hero";
import { Card } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import {
  getOverviewTotals,
  getActivityByMonth,
  getLeaderboard,
  getNightOwls,
  getConnectorLeaders,
  getHallOfFame,
  getSocialEdges,
  getTimeMachine,
} from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { computeSuperlatives } from "@/modules/discord-stats/superlatives";
import { AreaSparkline } from "@/modules/discord-stats/components/AreaSparkline";
import {
  StatTile,
  SectionTitle,
  BarList,
  MessageCard,
  SuperlativeCard,
  AuthorChip,
} from "@/modules/discord-stats/components/parts";
import { compact, full, shortDate } from "@/modules/discord-stats/format";

export const dynamic = "force-dynamic";

export default async function DiscordStatsOverview() {
  const [totals, byMonth, leaders, nightOwls, connectors, fame, edges, timeMachine] = await Promise.all([
    getOverviewTotals(),
    getActivityByMonth(),
    getLeaderboard(),
    getNightOwls(),
    getConnectorLeaders(),
    getHallOfFame({ limit: 3 }),
    getSocialEdges(),
    getTimeMachine(),
  ]);

  const superlatives = computeSuperlatives({ leaders, nightOwls, connectors, topFame: fame[0] ?? null });
  const pairs = edges.slice(0, 6);

  // Resolve every author we're about to render in one batch.
  const authorSeed = [
    ...leaders.map((l) => ({ authorId: l.authorId, authorName: l.authorName })),
    ...connectors.map((r) => ({ authorId: r.authorId, authorName: r.authorName })),
    ...fame.map((f) => ({ authorId: f.authorId, authorName: f.authorName })),
    ...pairs.flatMap((p) => [
      { authorId: p.a1, authorName: p.a1Name },
      { authorId: p.a2, authorName: p.a2Name },
    ]),
  ];
  const ids = await resolveIdentities(authorSeed);

  const years =
    totals.firstAt && totals.lastAt
      ? Math.max(1, Math.round((totals.lastAt.getTime() - totals.firstAt.getTime()) / 3.15e10))
      : 0;

  const topByMessages = leaders.slice(0, 5).map((l) => ({ identity: ids.get(l.authorId)!, value: l.messages }));
  const topByLove = [...leaders]
    .sort((a, b) => b.reactionsReceived - a.reactionsReceived)
    .slice(0, 5)
    .map((l) => ({ identity: ids.get(l.authorId)!, value: l.reactionsReceived }));

  return (
    <div className="space-y-8">
      <HeroBanner accentBg="bg-accent-blurple text-white" pattern="dots" kicker="The whole archive" kickerIcon="archive">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-bold leading-none sm:text-5xl">
              {full(totals.messages)} messages
            </h2>
            <p className="mt-2 font-mono text-xs uppercase tracking-wide text-white/80">
              {totals.authors} people · {totals.channels} channels · {years} years
              {totals.firstAt ? ` · since ${shortDate(totals.firstAt)}` : ""}
            </p>
          </div>
          <HeroCta href="/discord-stats/ask" className="bg-ink text-white">
            Ask the archive →
          </HeroCta>
        </div>
      </HeroBanner>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Messages" value={compact(totals.messages)} icon="megaphone" />
        <StatTile label="Reactions" value={compact(totals.reactions)} icon="heart" />
        <StatTile label="Replies" value={compact(totals.replies)} icon="arrows-horizontal" />
        <StatTile
          label="Busiest day"
          value={totals.busiestDay ? compact(totals.busiestDay.count) : "—"}
          sub={totals.busiestDay ? shortDate(totals.busiestDay.date) : undefined}
          icon="calendar"
        />
      </div>

      <section className="space-y-2">
        <SectionTitle>Five years of noise</SectionTitle>
        <AreaSparkline points={byMonth} height={130} />
      </section>

      {superlatives.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>The UDMies</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {superlatives.map((a) => (
              <SuperlativeCard key={a.key} award={a} identity={ids.get(a.authorId)!} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Top chatters</SectionTitle>
            <Link href="/discord-stats/people" className="font-mono text-xs uppercase text-accent-blurple no-underline">
              full board →
            </Link>
          </div>
          <Card>
            <BarList items={topByMessages} />
          </Card>
        </section>
        <section className="space-y-2">
          <SectionTitle>Most beloved</SectionTitle>
          <Card>
            <BarList items={topByLove} accent="bg-accent-red" />
          </Card>
        </section>
      </div>

      {pairs.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Inseparable (most shared conversations)</SectionTitle>
            <Link href="/discord-stats/soulmates" className="font-mono text-xs uppercase text-accent-blurple no-underline">
              the graph →
            </Link>
          </div>
          <Card className="flex flex-wrap gap-x-6 gap-y-2">
            {pairs.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <AuthorChip identity={ids.get(p.a1)!} />
                <PixelIcon name="arrows-horizontal" size={14} />
                <AuthorChip identity={ids.get(p.a2)!} />
                <span className="font-mono text-xs text-ink/50">{p.shared.toLocaleString()}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {timeMachine.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>On this day</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {timeMachine.slice(0, 2).map((t) => (
              <Card key={t.year} className="bg-paper">
                <p className="font-mono text-[11px] uppercase text-ink/50">
                  {t.year} · {t.channelName ? `#${t.channelName}` : ""}
                </p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap font-body text-sm leading-snug">{t.text}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {fame.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Hall of fame</SectionTitle>
            <Link href="/discord-stats/hall-of-fame" className="font-mono text-xs uppercase text-accent-blurple no-underline">
              all of it →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {fame.map((m) => (
              <MessageCard key={m.messageId} msg={m} identity={ids.get(m.authorId)!} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
