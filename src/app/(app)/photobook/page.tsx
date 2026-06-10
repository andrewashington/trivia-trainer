import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { EmptyState } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PhotoGrid, type GalleryPhoto } from "@/modules/photobook/PhotoGrid";
import { UploadPhotoForm } from "@/modules/photobook/UploadPhotoForm";

export const metadata = { title: "Photobook" };
export const dynamic = "force-dynamic";

export default async function PhotobookPage({
  searchParams,
}: {
  searchParams: { person?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const personFilter = searchParams.person || null;

  const [photos, members] = await Promise.all([
    db.photobookPhoto.findMany({
      where: personFilter ? { tags: { some: { userId: personFilter } } } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        file: true,
        uploader: { select: { id: true, displayName: true, avatarUrl: true } },
        tags: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    }),
    db.user.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, avatarUrl: true },
    }),
  ]);
  const maxMb = Number(process.env.MAX_FILE_SIZE_MB ?? 25);

  // Presign short-lived inline-view URLs (signing is local/cheap; the
  // page is force-dynamic so they stay fresh within the TTL).
  const gallery: GalleryPhoto[] = (
    await Promise.all(
      photos.map(async (p): Promise<GalleryPhoto | null> => {
        let viewUrl = "";
        try {
          viewUrl = await presignView(p.file.storageKey);
        } catch {
          return null;
        }
        return {
          id: p.id,
          caption: p.caption,
          createdAt: p.createdAt.toISOString(),
          viewUrl,
          uploader: p.uploader,
          tagged: p.tags.map((t) => t.user),
          canDelete: user.id === p.uploaderId || user.role === "admin",
        };
      })
    )
  ).filter((p): p is GalleryPhoto => p !== null);

  // Only offer filters for people who are actually tagged somewhere.
  const taggedSomewhere = await db.photobookTag.groupBy({ by: ["userId"] });
  const taggedIds = new Set(taggedSomewhere.map((t) => t.userId));
  const filterPeople = members.filter((m) => taggedIds.has(m.id));

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Photobook"
        icon="image"
        accentBg="bg-accent-coral"
        addLabel="Photo"
        tagline="Pics of the group, together"
      >
        <UploadPhotoForm members={members} maxMb={maxMb} />
      </ModuleHeader>

      {filterPeople.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50">
            Filter:
          </span>
          <Link
            href="/photobook"
            className={`brutal-press border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold no-underline shadow-brutal-sm ${
              !personFilter ? "bg-ink text-white" : "bg-card text-ink"
            }`}
          >
            Everyone
          </Link>
          {filterPeople.map((m) => (
            <Link
              key={m.id}
              href={`/photobook?person=${m.id}`}
              className={`brutal-press border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold no-underline shadow-brutal-sm ${
                personFilter === m.id ? "bg-accent-coral text-white" : "bg-card text-ink"
              }`}
            >
              {m.displayName}
            </Link>
          ))}
        </div>
      )}

      {gallery.length === 0 ? (
        <EmptyState
          icon="image"
          title={personFilter ? "No pics of them yet" : "The album is empty"}
          hint={
            personFilter
              ? "Tag them in a photo and it'll show up here."
              : "Upload a pic from the last hang — tag who made it into the frame."
          }
        />
      ) : (
        <PhotoGrid photos={gallery} />
      )}
    </div>
  );
}
