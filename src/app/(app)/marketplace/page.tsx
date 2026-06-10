import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { EmptyState, PageHeader } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { AddListingForm } from "@/modules/marketplace/AddListingForm";
import { HeroBanner } from "@/components/Hero";
import { ListingCard, type ListingView } from "@/modules/marketplace/ListingCard";

export const metadata = { title: "Market" };
export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: { history?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const listings = await db.listing.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      seller: { select: { id: true, displayName: true, venmoHandle: true, avatarUrl: true } },
      claimedBy: { select: { id: true, displayName: true, avatarUrl: true } },
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
    sellerAvatarUrl: l.seller.avatarUrl,
    sellerVenmo: l.seller.venmoHandle,
    claimedByName: l.claimedBy?.displayName ?? null,
    claimedByAvatarUrl: l.claimedBy?.avatarUrl ?? null,
    isMine: l.sellerId === user.id,
    myClaim: l.claimedById === user.id,
    isAdmin: user.role === "admin",
    tilt: i % 2 === 0 ? "tilt-l" : "tilt-r",
  });

  const showHistory = searchParams.history === "1";
  const active = listings.filter((l) => l.status !== "gone");
  const gone = listings.filter((l) => l.status === "gone");

  return (
    <div className="space-y-6">
      {showHistory ? (
        <PageHeader
          title="Sold & gone"
          icon="archive"
          accentBg="bg-accent-magenta text-white"
          action={
            <Link
              href="/marketplace"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              ← The market
            </Link>
          }
        />
      ) : (
        <ModuleHeader
          title="Market"
          icon="store"
          accentBg="bg-accent-magenta text-white"
          addLabel="Listing"
          extra={
            <Link
              href="/marketplace?history=1"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              Sold &amp; gone ({gone.length})
            </Link>
          }
        >
          <AddListingForm hasVenmo={!!user.venmoHandle} />
        </ModuleHeader>
      )}

      {!showHistory && (() => {
        const fresh = active.find((l) => l.status === "available");
        if (!fresh) return null;
        const days = Math.floor((Date.now() - fresh.createdAt.getTime()) / 86_400_000);
        const price = fresh.priceCents === null ? "FREE" : `$${(fresh.priceCents / 100).toFixed(fresh.priceCents % 100 === 0 ? 0 : 2)}`;
        return (
          <HeroBanner accentBg="bg-accent-magenta text-white" pattern="dots" kicker="Up for grabs" kickerIcon="store" pulse={fresh.priceCents === null} jumpTo={`listing-${fresh.id}`} jumpLabel="Claim it ↓">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">{fresh.title}</h2>
                <p className="mt-2 font-mono text-xs uppercase tracking-wide text-white/80">
                  from {fresh.seller.displayName} · {days === 0 ? "listed today" : `unclaimed for ${days}d`} — first come, first served ↓
                </p>
              </div>
              <p className="border-2 border-ink bg-accent-yellow px-4 py-1.5 font-display text-3xl font-bold text-ink shadow-brutal-sm">
                {price}
              </p>
            </div>
          </HeroBanner>
        );
      })()}

      {(showHistory ? gone : active).length === 0 ? (
        <EmptyState
          icon={showHistory ? "archive" : "shopping-cart"}
          title={showHistory ? "Nothing's gone yet" : "Nothing for sale"}
          hint={
            showHistory
              ? "Sold and given-away listings retire here."
              : "Someone's garage disagrees. List that toaster."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(showHistory ? gone : active).map((l, i) => (
            <ListingCard key={l.id} listing={toView(l, i)} />
          ))}
        </div>
      )}
    </div>
  );
}
