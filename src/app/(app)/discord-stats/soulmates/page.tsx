import { Card } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { getSoulmateBoard } from "@/modules/discord-stats/insights";
import { getPowerPairs } from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { AuthorChip, NeedsBuild, SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default async function SoulmatesPage() {
  const [board, pairs] = await Promise.all([getSoulmateBoard(), getPowerPairs()]);

  const ids = await resolveIdentities([
    ...board.flatMap((b) => [
      { authorId: b.authorId, authorName: b.authorName },
      { authorId: b.matchId, authorName: b.matchName },
    ]),
    ...pairs.flatMap((p) => [
      { authorId: p.replierId, authorName: p.replierName },
      { authorId: p.targetId, authorName: p.targetName },
    ]),
  ]);

  const tightest = [...board].sort((a, b) => b.similarity - a.similarity)[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <SectionTitle>Who thinks alike</SectionTitle>
        <p className="max-w-2xl text-sm text-ink/65">
          Each person becomes a single vector — the average of everything they&apos;ve ever said. The
          closest match is who they&apos;re most semantically alike, regardless of who replies to whom.
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

      {pairs.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Power pairs (who actually replies to whom)</SectionTitle>
          <Card className="space-y-1.5">
            {pairs.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <AuthorChip identity={ids.get(p.replierId)!} />
                <PixelIcon name="chevron-right" size={12} />
                <AuthorChip identity={ids.get(p.targetId)!} />
                <span className="ml-auto font-mono text-xs text-ink/50">{p.count.toLocaleString()} replies</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
