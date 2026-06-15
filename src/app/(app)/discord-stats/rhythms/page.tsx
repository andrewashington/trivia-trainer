import { Card } from "@/components/ui";
import {
  getHeatmap,
  getActivityByYear,
  getNightOwls,
  getAnomalySpikes,
} from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { Heatmap } from "@/modules/discord-stats/components/Heatmap";
import { AuthorChip, SectionTitle } from "@/modules/discord-stats/components/parts";
import { full, shortDate } from "@/modules/discord-stats/format";

export const dynamic = "force-dynamic";

export default async function RhythmsPage() {
  const [cells, byYear, owls, spikes] = await Promise.all([
    getHeatmap(),
    getActivityByYear(),
    getNightOwls(),
    getAnomalySpikes(),
  ]);
  const ids = await resolveIdentities(
    owls.map((o) => ({ authorId: o.authorId, authorName: o.authorName })),
  );
  const maxYear = Math.max(1, ...byYear.map((y) => y.count));

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <SectionTitle>When the group is awake (Mountain Time)</SectionTitle>
        <Card>
          <Heatmap cells={cells} />
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <SectionTitle>By the year</SectionTitle>
          <Card className="space-y-1.5">
            {byYear.map((y) => (
              <div key={y.year} className="flex items-center gap-2">
                <span className="w-10 shrink-0 font-mono text-xs text-ink/50">{y.year}</span>
                <div className="h-3.5 flex-1 border border-ink bg-paper">
                  <div className="h-full bg-accent-blurple" style={{ width: `${(y.count / maxYear) * 100}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-ink/70">
                  {full(y.count)}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section className="space-y-2">
          <SectionTitle>Night creatures (% after midnight)</SectionTitle>
          <Card className="space-y-2">
            {owls.slice(0, 8).map((o) => (
              <div key={o.authorId} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <AuthorChip identity={ids.get(o.authorId)!} />
                </div>
                <span className="font-mono text-sm tabular-nums text-accent-blurple">
                  {Math.round(o.lateShare * 100)}%
                </span>
              </div>
            ))}
          </Card>
        </section>
      </div>

      {spikes.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>What happened here? (busiest days ever)</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {spikes.map((s) => (
              <Card key={s.date} className="bg-paper">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-bold">{shortDate(s.date)}</span>
                  <span className="font-mono text-xs text-accent-blurple">
                    {full(s.count)} msgs · {s.z.toFixed(1)}σ
                  </span>
                </div>
                {s.channelName && (
                  <p className="mt-1 font-mono text-[11px] uppercase text-ink/45">#{s.channelName}</p>
                )}
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap font-body text-sm leading-snug text-ink/75">
                  {s.snippet}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
