"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { PixelIcon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { CommentThread } from "@/modules/comments/CommentThread";

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function FileRow({
  file,
  canDelete,
}: {
  file: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    uploaderName: string;
    uploaderAvatarUrl: string | null;
    previewUrl?: string | null;
    commentCount: number;
    viewerId: string;
    viewerIsAdmin: boolean;
  };
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const icon = file.mimeType === "application/pdf" ? ("file-text" as const) : ("image" as const);

  async function download() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(`/api/files/${file.id}/url`);
      window.open(url, "_blank");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't get download link.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/files/${file.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <li className="brutal-card space-y-2 p-3">
      <div className="flex items-center gap-3">
      {file.previewUrl ? (
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="block h-12 w-12 shrink-0 overflow-hidden border-2 border-ink"
          title="Open image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.previewUrl}
            alt={file.filename}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <PixelIcon name={icon} size={24} className="shrink-0 text-ink/70" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-snug">{file.filename}</p>
        <p className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/50">
          <Avatar name={file.uploaderName} src={file.uploaderAvatarUrl} size="sm" />
          {file.uploaderName} · {new Date(file.createdAt).toLocaleDateString()} ·{" "}
          {formatBytes(file.sizeBytes)}
        </p>
      </div>
      <button
        onClick={download}
        disabled={busy}
        className="brutal-press border-2 border-ink bg-accent-blue px-2.5 py-1 font-mono text-xs font-bold text-white shadow-brutal-sm"
      >
        ↓ Get
      </button>
      {canDelete && (
        <button
          onClick={remove}
          disabled={busy}
          className={`brutal-press border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm ${
            armed ? "bg-accent-red text-white" : "bg-card"
          }`}
        >
          {armed ? "Sure?" : "✕"}
        </button>
      )}
      </div>
      <CommentThread
        targetType="file"
        targetId={file.id}
        initialCount={file.commentCount}
        viewerId={file.viewerId}
        viewerIsAdmin={file.viewerIsAdmin}
      />
    </li>
  );
}
