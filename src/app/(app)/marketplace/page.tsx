import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { EmptyState, PageHeader } from "@/components/ui";
import { AddListingForm } from "@/modules/marketplace/AddListingForm";
import { ListingCard, type ListingView } from "@/modules/marketplace/ListingCard";

export const metadata = { title: "Market" };
export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const listings = await db.listing.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      seller: { select: { id: true, displayName: true, venmoHandle: true } },
      claimedBy: { select: { id: true, displayName: true } },
    },
  });

  const imageUrls = new Map<string, string>();
  await Promise.all(
    listings
      .filter((l) => l.imageKey)
      .map(async (l) => {
        try {
          imageUrls.set(l.id, await presignView(l.imageKey!));
        } catch {
          // render without an image
        }
      })
  );

  const toView = (l: (typeof listings)[number], i: number): ListingView => ({
    id: l.id,
    title: l.title,
    description: l.description,
    priceCents: l.priceCents,
    delivery: l.delivery,
    imageUrl: imageUrls.get(l.id) ?? null,
    status: l.status,
    sellerName: l.seller.displayName,
    sellerVenmo: l.seller.venmoHandle,
    claimedByName: l.claimedBy?.displayName ?? null,
    isMine: l.sellerId === user.id,
    myClaim: l.claimedById === user.id,
    isAdmin: user.role === "admin",
    tilt: i % 2 === 0 ? "tilt-l" : "tilt-r",
  });

  const active = listings.filter((l) => l.status !== "gone");
  const gone = listings.filter((l) => l.status === "gone").slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader title="🏷️ Market" accentBg="bg-accent-magenta text-white" />
      <AddListingForm hasVenmo={!!user.venmoHandle} />

      {active.length === 0 && gone.length === 0 ? (
        <EmptyState
          icon="🧸"
          title="Nothing for sale"
          hint="Someone's garage disagrees. List that toaster."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {active.map((l, i) => (
              <ListingCard key={l.id} listing={toView(l, i)} />
            ))}
          </div>
          {gone.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
                Sold &amp; gone
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {gone.map((l, i) => (
                  <ListingCard key={l.id} listing={toView(l, i)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
