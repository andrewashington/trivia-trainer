import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { MapBoard } from "@/modules/map/MapBoard";

export const metadata = { title: "Map" };
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const pins = await db.mapPin.findMany({
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="The Map" icon="map-pin" accentBg="bg-accent-teal" />
      <MapBoard
        initialPins={pins.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          note: p.note,
          creatorId: p.creator.id,
          creatorName: p.creator.displayName,
          creatorAvatarUrl: p.creator.avatarUrl,
          canDelete: user.id === p.creatorId || user.role === "admin",
        }))}
      />
      {pins.length === 0 && (
        <EmptyState
          icon="gps"
          title="The map is uncharted"
          hint="Pin the group's favorite taco spot before someone forgets where it is."
        />
      )}
    </div>
  );
}
