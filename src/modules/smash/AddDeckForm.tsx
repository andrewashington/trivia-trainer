"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Input, Textarea } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";

/** Parse "Name | https://image.url" lines into card inputs. */
function parseCards(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split("|").map((s) => s.trim());
      return { label, imageUrl: url || null };
    });
}

export function AddDeckForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [cardsRaw, setCardsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardCount = parseCards(cardsRaw).length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/smash", {
        method: "POST",
        body: { title, detail: detail || null, cards: parseCards(cardsRaw) },
      });
      setTitle("");
      setDetail("");
      setCardsRaw("");
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't deal that deck.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">Deal a deck</p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Theme — e.g. 90s heartthrobs"
        required
        maxLength={100}
      />
      <Input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="House rules / context (optional)"
        maxLength={300}
      />
      <Textarea
        value={cardsRaw}
        onChange={(e) => setCardsRaw(e.target.value)}
        rows={6}
        placeholder={"One name per line — optionally `Name | https://image.url`"}
        required
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase text-ink/50">
          {cardCount} card{cardCount === 1 ? "" : "s"} {cardCount < 2 ? "— need at least 2" : ""}
        </span>
        <Button type="submit" variant="primary" disabled={busy || !title.trim() || cardCount < 2}>
          {busy ? "…" : "Deal it"}
        </Button>
      </div>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
    </form>
  );
}
