"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

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
  };
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const icon = file.mimeType === "application/pdf" ? "📄" : "🖼️";

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
    <li className="brutal-card flex items-center gap-3 p-3">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-snug">{file.filename}</p>
        <p className="font-mono text-xs text-ink/50">
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
    </li>
  );
}
