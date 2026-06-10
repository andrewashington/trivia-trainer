"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Textarea } from "@/components/ui";

export function EntryForm({ challengeId, maxMb }: { challengeId: string; maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0] ?? null;
    if (!text.trim() && !file) {
      setError("Bring proof: some words, a photo, or both.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl } = await api<{ uploadUrl: string | null }>(
        `/api/challenges/${challengeId}/entries`,
        {
          method: "POST",
          body: {
            text: text.trim() || null,
            photo: file
              ? { filename: file.name, mimeType: file.type, sizeBytes: file.size }
              : null,
          },
        }
      );
      if (file && uploadUrl) {
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("Upload to storage failed.");
      }
      setText("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">Your entry — one shot, make it count</p>
      <Field label="Proof in words (optional if you attach a photo)">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Found it behind the couch. As foretold."
          maxLength={2000}
        />
      </Field>
      <Field label={`Photo proof (optional, max ${maxMb} MB)`}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="brutal-input file:mr-3 file:border-2 file:border-ink file:bg-accent-rust file:px-3 file:py-1 file:font-display file:font-bold file:uppercase file:text-white"
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" variant="yellow" disabled={busy} className="w-full">
        {busy ? "Submitting…" : "Submit entry"}
      </Button>
    </form>
  );
}
