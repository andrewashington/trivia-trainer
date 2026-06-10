"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Input, Textarea } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";

export function CreateTierListForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addDraft() {
    const label = draft.trim();
    if (!label) return;
    if (items.some((i) => i.toLowerCase() === label.toLowerCase())) {
      setDraft("");
      return;
    }
    setItems((prev) => [...prev, label]);
    setDraft("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Catch the "typed an item but never pressed Add" case.
    const finalItems = draft.trim()
      ? [...items.filter((i) => i.toLowerCase() !== draft.trim().toLowerCase()), draft.trim()]
      : items;
    if (finalItems.length < 2) {
      setError("Add at least 2 things to rank.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { list } = await api<{ list: { id: string } }>("/api/tiers", {
        method: "POST",
        body: { title, description: description || null, items: finalItems },
      });
      closeForm();
      router.push(`/tiers/${list.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the list.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">New tier list</p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Rank: gas station snacks"
        required
        maxLength={120}
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Ground rules, context, trash talk (optional)"
        maxLength={1000}
      />
      <div>
        <p className="brutal-label mb-2">Things to rank ({items.length})</p>
        {items.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {items.map((label) => (
              <li
                key={label}
                className="inline-flex items-center gap-1 border-2 border-ink bg-paper px-2 py-0.5 font-mono text-xs"
              >
                {label}
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  className="font-bold text-ink/60 hover:text-ink"
                  onClick={() => setItems((prev) => prev.filter((i) => i !== label))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            placeholder="Add an item, hit enter"
            maxLength={120}
          />
          <Button type="button" onClick={addDraft} disabled={!draft.trim()} className="shrink-0">
            Add
          </Button>
        </div>
      </div>
      <Button type="submit" variant="yellow" disabled={busy || !title.trim()}>
        {busy ? "…" : "Create list"}
      </Button>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
    </form>
  );
}
