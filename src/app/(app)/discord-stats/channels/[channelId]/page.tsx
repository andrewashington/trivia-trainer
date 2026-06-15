import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getChannelDetail } from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { AreaSparkline } from "@/modules/discord-stats/components/AreaSparkline";
import { BarList, MessageCard, SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default async function ChannelDetailPage({ params }: { params: { channelId: string } }) {
  const detail = await getChannelDetail(params.channelId);
  if (!detail) notFound();

  const ids = await resolveIdentities([
    ...detail.topAuthors.map((a) => ({ authorId: a.authorId, authorName: a.authorName })),
    ...detail.fame.map((f) => ({ authorId: f.authorId, authorName: f.authorName })),
  ]);
  const total = detail.byMonth.reduce((s, m) => s + m.count, 0);

  return (
    <div className="space-y-6">
      <Link href="/discord-stats/channels" className="inline-block font-mono text-xs uppercase text-ink/50 no-underline">
        ← channels
      </Link>
      <h2 className="font-display text-3xl font-bold leading-none">#{detail.channel.name ?? detail.channel.id}</h2>
      <p className="font-mono text-xs uppercase text-ink/50">{total.toLocaleString()} messages</p>

      <section className="space-y-2">
        <SectionTitle>Activity</SectionTitle>
        <AreaSparkline points={detail.byMonth} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <SectionTitle>Top posters</SectionTitle>
          <Card>
            <BarList
              items={detail.topAuthors.map((a) => ({ identity: ids.get(a.authorId)!, value: a.count }))}
            />
          </Card>
        </section>
        {detail.fame.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>Most-reacted here</SectionTitle>
            <div className="space-y-3">
              {detail.fame.slice(0, 3).map((m) => (
                <MessageCard key={m.messageId} msg={m} identity={ids.get(m.authorId)!} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
