import { getGalaxyPoints, getTopicClusters, getTopicTrends } from "@/modules/discord-stats/insights";
import { GalaxyCanvas } from "@/modules/discord-stats/components/GalaxyCanvas";
import { Streamgraph } from "@/modules/discord-stats/components/Streamgraph";
import { NeedsBuild, SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default async function GalaxyPage() {
  const [points, clusters, trends] = await Promise.all([
    getGalaxyPoints(),
    getTopicClusters(),
    getTopicTrends(),
  ]);

  if (!points.length) return <NeedsBuild what="The Vibe Galaxy" />;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <SectionTitle>The Vibe Galaxy · every conversation, mapped by meaning</SectionTitle>
        <GalaxyCanvas points={points} clusters={clusters.map((c) => ({ id: c.id, label: c.label, size: c.size }))} />
      </section>

      {trends.length > 0 && clusters.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>What we talk about, over time</SectionTitle>
          <Streamgraph clusters={clusters} trends={trends} />
        </section>
      )}
    </div>
  );
}
