import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AddWishForm } from "@/modules/wishlist/AddWishForm";
import { WishActions } from "@/modules/wishlist/WishActions";

export const metadata = { title: "Wishlist" };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const items = await db.wishlistItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, displayName: true } } },
  });

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
      <PageHeader title="🎁 Wishlist" accentBg="bg-accent-orange" />
      <AddWishForm />

      {groups.length === 0 ? (
        <EmptyState
          icon="🛍️"
          title="Nobody wants anything?"
          hint="Paste a link above — gift-giving season sneaks up fast."
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
          ))}
        </div>
      )}
    </div>
  );
}
