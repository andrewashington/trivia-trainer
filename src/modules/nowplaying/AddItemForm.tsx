"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Input } from "@/components/ui";

const TYPES = [
  { value: "show", label: "📺 Show" },
  { value: "movie", label: "🎬 Movie" },
  { value: "book", label: "📚 Book" },
] as const;

export function AddItemForm() {
  const router = useRouter();
  const [mediaType, setMediaType] = useState<"show" | "movie" | "book">("show");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/nowplaying", {
        method: "POST",
        body: { mediaType, title, note: note || null },
      });
      setTitle("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">What are you into right now?</p>
      <div className="flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setMediaType(t.value)}
            className={`brutal-press flex-1 border-2 border-ink px-2 py-1.5 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              mediaType === t.value ? "bg-accent-yellow" : "bg-card"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One-line take (optional)"
        maxLength={500}
      />
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" variant="yellow" disabled={busy} className="w-full">
        {busy ? "Adding…" : "Add to my board"}
      </Button>
    </form>
  );
}
