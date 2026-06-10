"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Button, Field, Input } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";

export type Member = { id: string; displayName: string; avatarUrl: string | null };

export function UploadPhotoForm({ members, maxMb }: { members: Member[]; maxMb: number }) {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setTagged((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl } = await api<{ uploadUrl: string }>("/api/photobook", {
        method: "POST",
        body: {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          caption: caption.trim() || undefined,
          taggedUserIds: tagged,
        },
      });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed.");
      if (inputRef.current) inputRef.current.value = "";
      setCaption("");
      setTagged([]);
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label={`Photo (images only, max ${maxMb} MB)`}>
        <input
          ref={inputRef}
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="brutal-input file:mr-3 file:border-2 file:border-ink file:bg-accent-coral file:px-3 file:py-1 file:font-display file:font-bold file:uppercase"
        />
      </Field>
      <Field label="Caption (optional)">
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
          placeholder="The night the karaoke machine broke"
        />
      </Field>
      <div>
        <p className="brutal-label">Who&apos;s in it? (optional)</p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = tagged.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={`brutal-press inline-flex items-center gap-1.5 border-2 border-ink px-2 py-1 font-mono text-xs font-bold shadow-brutal-sm ${
                  on ? "bg-accent-coral text-white" : "bg-card"
                }`}
              >
                <Avatar name={m.displayName} src={m.avatarUrl} size="sm" />
                {m.displayName}
                {on && " ✓"}
              </button>
            );
          })}
        </div>
      </div>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" variant="yellow" disabled={busy} className="w-full">
        {busy ? "Uploading…" : "Add to the book"}
      </Button>
    </form>
  );
}
