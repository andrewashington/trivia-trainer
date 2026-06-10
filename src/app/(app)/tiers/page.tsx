import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { ModuleHeader } from "@/components/ModuleHeader";
import { CreateTierListForm } from "@/modules/tiers/CreateTierListForm";

export const metadata = { title: "Tiers" };
export const dynamic = "force-dynamic";

export default async function TiersPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const lists = await db.tierList.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, displayName: true, avatarUrl: true } },
      items: { select: { id: true } },
      placements: { select: { userId: true } },
    },
  });

  return (
    <div className="space-y-6">
      <ModuleHeader title="Tiers" icon="crown" accentBg="bg-accent-crimson" addLabel="Tier list">
        <CreateTierListForm />
      </ModuleHeader>

      {lists.length === 0 ? (
        <EmptyState
          icon="crown"
          title="No tier lists yet"
          hint="We deserve to make lists. Start one — fast food, group chat moments, anything."
        />
      ) : (
        <ul className="space-y-3">
          {lists.map((list) => {
            const rankers = new Set(list.placements.map((p) => p.userId));
            const iRanked = rankers.has(user.id);
            return (
              <li key={list.id}>
                <Link
                  href={`/tiers/${list.id}`}
                  className="brutal-card block p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-bold leading-snug">{list.title}</h2>
                      {list.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-ink/60">{list.description}</p>
                      )}
                      <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink/50">
                        {list.items.length} items · ranked by {rankers.size}
                        {rankers.size === 1 ? " person" : " people"} · by{" "}
                        {list.creator.displayName}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 border-2 border-ink px-2 py-1 font-mono text-xs font-bold uppercase ${
                        iRanked ? "bg-accent-green" : "bg-accent-yellow"
                      }`}
                    >
                      <PixelIcon name={iRanked ? "check" : "zap"} size={13} />
                      {iRanked ? "Ranked" : "Rank it"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
