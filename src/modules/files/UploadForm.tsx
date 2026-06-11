"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";
import { PixelIcon } from "@/components/icons";

export function UploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl } = await api<{ uploadUrl: string }>("/api/files", {
        method: "POST",
        body: { filename: file.name, mimeType: file.type, sizeBytes: file.size, sensitive },
      });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">Drop something in (images & PDFs, max {maxMb} MB)</p>
      <input
        ref={inputRef}
        type="file"
        required
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="brutal-input file:mr-3 file:border-2 file:border-ink file:bg-accent-green file:px-3 file:py-1 file:font-display file:font-bold file:uppercase"
      />
      <button
        type="button"
        onClick={() => setSensitive(!sensitive)}
        aria-pressed={sensitive}
        className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
          sensitive ? "bg-ink text-white" : "bg-card"
        }`}
      >
        <PixelIcon name={sensitive ? "eye-off" : "eye"} size={13} className="-mt-0.5 mr-1 inline" />
        {sensitive
          ? "Sensitive — blurred until tapped"
          : "Visible to all (tap to mark sensitive)"}
      </button>

      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" variant="green" disabled={busy} className="w-full">
        {busy ? "Uploading…" : "Upload"}
      </Button>
    </form>
  );
}
