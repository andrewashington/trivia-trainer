"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Input, Textarea } from "@/components/ui";

export function AddIdeaForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/ideas", {
        method: "POST",
        body: { title, detail: detail || null },
      });
      setTitle("");
      setDetail("");
      setExpanded(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">Got an idea?</p>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="We should…"
          required
          maxLength={200}
        />
        <Button type="submit" variant="yellow" disabled={busy || !title.trim()} className="shrink-0">
          {busy ? "…" : "Pitch it"}
        </Button>
      </div>
      {expanded && (
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={2}
          placeholder="Sell it a little (optional)"
          maxLength={2000}
        />
      )}
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
    </form>
  );
}
