import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { FileRow } from "@/modules/files/FileRow";
import { UploadForm } from "@/modules/files/UploadForm";

export const metadata = { title: "Files" };
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const files = await db.fileObject.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, displayName: true } } },
  });
  const maxMb = Number(process.env.MAX_FILE_SIZE_MB ?? 25);

  return (
    <div className="space-y-6">
      <PageHeader title="📦 Files" accentBg="bg-accent-green" />
      <UploadForm maxMb={maxMb} />

      {files.length === 0 ? (
        <EmptyState
          icon="🗃️"
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
              }}
              canDelete={user.id === f.uploaderId || user.role === "admin"}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
