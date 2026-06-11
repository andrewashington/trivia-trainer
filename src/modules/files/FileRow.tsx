"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { PixelIcon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { CommentThread } from "@/modules/comments/CommentThread";
import { Spoiler } from "@/components/Spoiler";

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
    uploaderId: string;
    uploaderName: string;
    uploaderAvatarUrl: string | null;
    previewUrl?: string | null;
    sensitive: boolean;
    commentCount: number;
    viewerId: string;
    viewerIsAdmin: boolean;
  };
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  // PDFs render on demand — an <iframe> per row would make the page heavy.
  const [showPdf, setShowPdf] = useState(false);

  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isPdf = file.mimeType === "application/pdf";
  const icon = isPdf ? ("file-text" as const) : ("image" as const);

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
        {!file.previewUrl && (
          <PixelIcon name={icon} size={24} className="shrink-0 text-ink/70" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-snug">{file.filename}</p>
          <p className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/50">
            <Link
              href={`/people/${file.uploaderId}`}
              className="inline-flex items-center gap-1.5 text-ink/50 no-underline hover:text-accent-blue"
            >
              <Avatar name={file.uploaderName} src={file.uploaderAvatarUrl} size="sm" />
              {file.uploaderName}
            </Link>{" "}
            · {new Date(file.createdAt).toLocaleDateString()} · {formatBytes(file.sizeBytes)}
          </p>
        </div>
        {isPdf && file.previewUrl && (
          <button
            onClick={() => setShowPdf((s) => !s)}
            className="brutal-press border-2 border-ink bg-card px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm"
          >
            {showPdf ? "Hide" : "View"}
          </button>
        )}
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

      {/* Inline rendering: anything the browser can show natively gets
          shown, full-width; the ↓ Get button stays for the actual file. */}
      {file.previewUrl && (isImage || isVideo || isAudio || (isPdf && showPdf)) && (() => {
        const preview = (
          <>
            {isImage && (
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className="block w-full overflow-hidden border-2 border-ink"
                title="Open original"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.previewUrl}
                  alt={file.filename}
                  loading="lazy"
                  className="max-h-96 w-full object-contain bg-paper"
                />
              </button>
            )}
            {isVideo && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={file.previewUrl}
                controls
                preload="metadata"
                className="max-h-96 w-full border-2 border-ink bg-ink"
              />
            )}
            {isAudio && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio src={file.previewUrl} controls preload="metadata" className="w-full" />
            )}
            {isPdf && showPdf && (
              <iframe
                src={file.previewUrl}
                title={file.filename}
                className="h-96 w-full border-2 border-ink bg-card"
              />
            )}
          </>
        );
        return file.sensitive ? (
          <Spoiler label="Sensitive file — tap to reveal">{preview}</Spoiler>
        ) : preview;
      })()}

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
