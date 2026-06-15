import { Card } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { getSoulmateBoard } from "@/modules/discord-stats/insights";
import { getSocialEdges, getLeaderboard } from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { AuthorChip, NeedsBuild, SectionTitle } from "@/modules/discord-stats/components/parts";
import { SocialGraph, type GraphNode, type GraphEdge } from "@/modules/discord-stats/components/SocialGraph";

export const dynamic = "force-dynamic";

const MAX_NODES = 18;

export default async function SocialPage() {
  const [edges, leaders, board] = await Promise.all([
    getSocialEdges(),
    getLeaderboard(),
    getSoulmateBoard(),
  ]);

  // Graph nodes: the most active authors who appear in the edge set; edges
  // among them only, capped, so the graph stays legible.
  const messagesById = new Map(leaders.map((l) => [l.authorId, l.messages]));
  const inEdges = new Set(edges.flatMap((e) => [e.a1, e.a2]));
  const nodeIds = leaders
    .filter((l) => inEdges.has(l.authorId))
    .slice(0, MAX_NODES)
    .map((l) => l.authorId);
  const nodeSet = new Set(nodeIds);
  const graphEdges: GraphEdge[] = edges
    .filter((e) => nodeSet.has(e.a1) && nodeSet.has(e.a2))
    .map((e) => ({ a: e.a1, b: e.a2, shared: e.shared }));

  const ids = await resolveIdentities([
    ...edges.flatMap((e) => [
      { authorId: e.a1, authorName: e.a1Name },
      { authorId: e.a2, authorName: e.a2Name },
    ]),
    ...board.flatMap((b) => [
      { authorId: b.authorId, authorName: b.authorName },
      { authorId: b.matchId, authorName: b.matchName },
    ]),
  ]);

  const nodes: GraphNode[] = nodeIds.map((id) => {
    const idn = ids.get(id)!;
    return { authorId: id, name: idn.name, avatarUrl: idn.avatarUrl, weight: messagesById.get(id) ?? 1 };
  });

  const tightest = [...board].sort((a, b) => b.similarity - a.similarity)[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <SectionTitle>The social graph · who shares conversations</SectionTitle>
        <p className="max-w-2xl text-sm text-ink/65">
          The group barely uses replies — you talk in bursts. So this maps who actually shows up in
          the same conversations: thicker lines = more shared bursts, bigger dots = more active.
          Hover anyone to isolate their circle.
        </p>
        {nodes.length >= 2 ? (
          <SocialGraph nodes={nodes} edges={graphEdges} />
        ) : (
          <p className="text-sm text-ink/50">Not enough conversation data yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>Who thinks alike (semantic)</SectionTitle>
        <p className="max-w-2xl text-sm text-ink/65">
          A different lens: each person becomes the average of everything they&apos;ve said, then
          matched on meaning — independent of who they hang out with.
        </p>
        {board.length === 0 ? (
          <NeedsBuild what="Semantic soulmates" />
        ) : (
          <>
            {tightest && (
              <Card className="bg-accent-blurple text-white">
                <p className="brutal-label text-white/70">Tightest minds in the server</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 [&_a]:text-white [&_a:hover]:text-white">
                  <AuthorChip identity={ids.get(tightest.authorId)!} />
                  <PixelIcon name="heart" size={16} />
                  <AuthorChip identity={ids.get(tightest.matchId)!} />
                  <span className="font-mono text-sm">{Math.round(tightest.similarity * 100)}% alike</span>
                </div>
              </Card>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {board.map((b) => (
                <Card key={b.authorId} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <AuthorChip identity={ids.get(b.authorId)!} />
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/55">
                      <span>→</span>
                      <AuthorChip identity={ids.get(b.matchId)!} size="sm" />
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-accent-blurple">
                    {Math.round(b.similarity * 100)}%
                  </span>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
