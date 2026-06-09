import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AddItemForm } from "@/modules/nowplaying/AddItemForm";
import { ItemActions } from "@/modules/nowplaying/ItemActions";
import { MEDIA_ICONS } from "@/modules/nowplaying/schema";

export const metadata = { title: "Now Playing" };
export const dynamic = "force-dynamic";

export default async function NowPlayingPage({
  searchParams,
}: {
  searchParams: { history?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const showHistory = searchParams.history === "1";

  const items = await db.nowPlayingItem.findMany({
    where: { status: showHistory ? "finished" : "active" },
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { id: true, displayName: true } } },
  });

  // Group by person; the signed-in user's board floats to the top.
  const byUser = new Map<string, { name: string; items: typeof items }>();
  for (const item of items) {
    const entry = byUser.get(item.userId) ?? { name: item.user.displayName, items: [] };
    entry.items.push(item);
    byUser.set(item.userId, entry);
  }
  const groups = [...byUser.entries()].sort(([a], [b]) =>
    a === user.id ? -1 : b === user.id ? 1 : 0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="📺 Now Playing"
        accentBg="bg-accent-yellow"
        action={
          <Link
            href={showHistory ? "/nowplaying" : "/nowplaying?history=1"}
            className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
          >
            {showHistory ? "← Back to the board" : "🪦 The graveyard"}
          </Link>
        }
      />

      {!showHistory && <AddItemForm />}

      {groups.length === 0 ? (
        <EmptyState
          icon={showHistory ? "🪦" : "📡"}
          title={showHistory ? "Nothing finished yet" : "The board is empty"}
          hint={
            showHistory
              ? "Finish something and it retires here with honor."
              : "Nobody's watching, reading, or bingeing anything? Suspicious."
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([userId, group]) => (
            <Card key={userId} className={userId === user.id ? "tilt-l" : ""}>
              <div className="flex items-center gap-2 border-b-2 border-ink pb-2">
                <Avatar name={group.name} size="sm" />
                <span className="font-display font-bold">
                  {userId === user.id ? "You" : group.name}
                </span>
                <Badge className="bg-paper ml-auto">{group.items.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold leading-snug">
                        {MEDIA_ICONS[item.mediaType]} {item.title}
                      </p>
                      {item.note && (
                        <p className="mt-0.5 text-sm italic text-ink/60">
                          &ldquo;{item.note}&rdquo;
                        </p>
                      )}
                    </div>
                    {!showHistory && (userId === user.id || user.role === "admin") && (
                      <ItemActions itemId={item.id} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
