import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { presignView } from "@/lib/storage";
import { EmptyState } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { FileRow } from "@/modules/files/FileRow";
import { UploadForm } from "@/modules/files/UploadForm";
import { commentCounts } from "@/modules/comments/counts";

export const metadata = { title: "Files" };
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const files = await db.fileObject.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  const maxMb = Number(process.env.MAX_FILE_SIZE_MB ?? 25);
  const counts = await commentCounts("file");

  // Presign inline-view URLs for image files so the list can show a
  // thumbnail (signing is local/cheap; the page is force-dynamic so these
  // stay fresh within the URL's TTL).
  const previews = new Map<string, string>(
    await Promise.all(
      files
        .filter((f) => f.mimeType.startsWith("image/"))
        .map(async (f): Promise<[string, string]> => {
          try {
            return [f.id, await presignView(f.storageKey)];
          } catch {
            return [f.id, ""];
          }
        })
    )
  );

  return (
    <div className="space-y-6">
      <ModuleHeader title="Files" icon="folder" accentBg="bg-accent-green" addLabel="Upload">
        <UploadForm maxMb={maxMb} />
      </ModuleHeader>

      {files.length === 0 ? (
        <EmptyState
          icon="archive"
          title="The vault is empty"
          hint="Memes, scans, flyers, that one cursed photo — drop them here."
        />
      ) : (
        <ul className="space-y-3">
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={{
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                sizeBytes: f.sizeBytes,
                createdAt: f.createdAt.toISOString(),
                uploaderName: f.uploader.displayName,
                uploaderAvatarUrl: f.uploader.avatarUrl,
                previewUrl: previews.get(f.id) || null,
                commentCount: counts.get(f.id) ?? 0,
                viewerId: user.id,
                viewerIsAdmin: user.role === "admin",
              }}
              canDelete={user.id === f.uploaderId || user.role === "admin"}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
