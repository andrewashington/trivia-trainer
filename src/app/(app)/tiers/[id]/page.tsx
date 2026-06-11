import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Card, UserLink } from "@/components/ui";
import { CommentThread } from "@/modules/comments/CommentThread";
import { DeleteButton } from "@/components/DeleteButton";
import { TierBoards, type RankerView } from "@/modules/tiers/TierBoards";
import { TIERS, type Tier } from "@/modules/tiers/schema";
import { Spoiler } from "@/components/Spoiler";

export const dynamic = "force-dynamic";

export default async function TierListPage({ params }: { params: { id: string } }) {
  const [user, list] = await Promise.all([
    currentUser(),
    db.tierList.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        items: { orderBy: { position: "asc" }, select: { id: true, label: true } },
        placements: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    }),
  ]);
  if (!user) redirect("/signin");
  if (!list) notFound();

  const commentCount = await db.comment.count({
    where: { targetType: "tierlist", targetId: list.id },
  });

  // Group placements per user — each ranker gets a board.
  const rankerMap = new Map<string, RankerView>();
  // Me first so the client board initializes even before I've ranked.
  rankerMap.set(user.id, {
    id: user.id,
    name: user.displayName,
    avatarUrl: user.avatarUrl,
    placements: {},
  });
  for (const p of list.placements) {
    if (!TIERS.includes(p.tier as Tier)) continue;
    const r =
      rankerMap.get(p.userId) ??
      rankerMap
        .set(p.userId, {
          id: p.user.id,
          name: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          placements: {},
        })
        .get(p.userId)!;
    r.placements[p.itemId] = { tier: p.tier as Tier, position: p.position };
  }

  const canDelete = user.id === list.creatorId || user.role === "admin";
  const rankedCount = [...rankerMap.values()].filter(
    (r) => Object.keys(r.placements).length > 0
  ).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/tiers" className="font-mono text-xs uppercase text-ink/50 hover:text-ink">
        ← All tier lists
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl">{list.title}</h1>
          {list.description && <p className="mt-2 text-sm text-ink/70">{list.description}</p>}
          <div className="mt-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-ink/50">
            <UserLink
              userId={list.creator.id}
              name={list.creator.displayName}
              avatarUrl={list.creator.avatarUrl}
            />
            <span>
              · {list.items.length} items · {rankedCount} ranked
            </span>
          </div>
        </div>
        {canDelete && <DeleteButton endpoint={`/api/tiers/${list.id}`} redirectTo="/tiers" />}
      </div>

      {list.sensitive ? (
        <Spoiler label="Sensitive — tap to reveal">
          <TierBoards
            listId={list.id}
            items={list.items}
            meId={user.id}
            rankers={[...rankerMap.values()]}
          />
        </Spoiler>
      ) : (
        <TierBoards
          listId={list.id}
          items={list.items}
          meId={user.id}
          rankers={[...rankerMap.values()]}
        />
      )}

      <Card>
        <CommentThread
          targetType="tierlist"
          targetId={list.id}
          initialCount={commentCount}
          viewerId={user.id}
          viewerIsAdmin={user.role === "admin"}
        />
      </Card>
    </div>
  );
}
