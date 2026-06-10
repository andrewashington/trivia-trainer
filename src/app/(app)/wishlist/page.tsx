import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState } from "@/components/ui";
import { HeroBanner, HeroCta } from "@/components/Hero";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddWishForm } from "@/modules/wishlist/AddWishForm";
import { WishActions } from "@/modules/wishlist/WishActions";

export const metadata = { title: "Wishlist" };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const items = await db.wishlistItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  // Birthday radar: the next birthday on file powers the hero.
  const cards = await db.contactCard.findMany({
    where: { birthday: { not: null } },
    include: { user: { select: { id: true, displayName: true } } },
  });
  const today = new Date();
  const nextBirthday = cards
    .map((c) => {
      const b = c.birthday!;
      const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
      if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        next.setFullYear(next.getFullYear() + 1);
      }
      const daysAway = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { name: c.user.displayName, userId: c.userId, daysAway };
    })
    .sort((a, b) => a.daysAway - b.daysAway)[0];

  const byUser = new Map<string, { name: string; avatarUrl: string | null; items: typeof items }>();
  for (const item of items) {
    const entry = byUser.get(item.userId) ?? { name: item.user.displayName, avatarUrl: item.user.avatarUrl, items: [] };
    entry.items.push(item);
    byUser.set(item.userId, entry);
  }
  const groups = [...byUser.entries()].sort(([a], [b]) =>
    a === user.id ? -1 : b === user.id ? 1 : 0
  );

  return (
    <div className="space-y-6">
      <ModuleHeader title="Wishlist" icon="gift" accentBg="bg-accent-orange" addLabel="Wish">
        <AddWishForm />
      </ModuleHeader>

      {nextBirthday && nextBirthday.daysAway <= 45 && (
        <HeroBanner
          accentBg="bg-accent-orange"
          pattern="rays"
          kicker="Birthday radar"
          kickerIcon="gift"
          pulse={nextBirthday.daysAway <= 7}
          jumpTo={byUser.has(nextBirthday.userId) ? `wish-${nextBirthday.userId}` : undefined}
          jumpLabel="See their list ↓"
        >
          <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
            {nextBirthday.name}&apos;s birthday is{" "}
            {nextBirthday.daysAway === 0 ? "TODAY" : nextBirthday.daysAway === 1 ? "tomorrow" : `in ${nextBirthday.daysAway} days`}
          </h2>
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink/70">
            {byUser.get(nextBirthday.userId)?.items.length
              ? `${byUser.get(nextBirthday.userId)!.items.length} wishes on their list — no excuses ↓`
              : "No wishes on their list yet. Apply peer pressure."}
          </p>
        </HeroBanner>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon="handbag"
          title="Nobody wants anything?"
          hint="Paste a link above — gift-giving season sneaks up fast."
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([userId, group]) => (
            <div key={userId} id={`wish-${userId}`} className="scroll-mt-24">
            <Card className={userId === user.id ? "tilt-l" : ""}>
              <div className="flex items-center gap-2 border-b-2 border-ink pb-2">
                <Avatar name={group.name} src={group.avatarUrl} size="sm" />
                <span className="font-display font-bold">
                  {userId === user.id ? "You" : group.name}
                </span>
                <Badge className="bg-paper ml-auto">{group.items.length}</Badge>
              </div>
              <ul className="mt-3 space-y-3">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 border-2 border-ink object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink hover:text-accent-blue"
                          >
                            {item.title} ↗
                          </a>
                        ) : (
                          item.title
                        )}
                      </p>
                      {item.siteName && (
                        <p className="font-mono text-[10px] uppercase text-ink/40">
                          {item.siteName}
                        </p>
                      )}
                      {item.note && (
                        <p className="mt-0.5 text-sm italic text-ink/60">{item.note}</p>
                      )}
                    </div>
                    {(userId === user.id || user.role === "admin") && (
                      <WishActions itemId={item.id} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
