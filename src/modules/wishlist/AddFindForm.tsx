"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";
import { PixelIcon } from "@/components/icons";
import { COOL_FIND_CATEGORIES } from "@/modules/wishlist/schema";

export function AddFindForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof COOL_FIND_CATEGORIES)[number]>("interesting");
  const [note, setNote] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchDetails() {
    if (!url) return;
    setFetching(true);
    setError(null);
    try {
      const { preview } = await api<{
        preview: { title: string | null; imageUrl: string | null; siteName: string | null };
      }>("/api/wishlist/preview", { method: "POST", body: { url } });
      if (preview.title && !title) setTitle(preview.title);
      setImageUrl(preview.imageUrl);
      setSiteName(preview.siteName);
      if (!preview.title && !preview.imageUrl) {
        setError("That page didn't give up any details — fill in the title yourself.");
      }
    } catch (err) {
      setError(err instanceof Error ? `${err.message} You can still add it manually.` : "Couldn't fetch that link.");
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/wishlist/finds", {
        method: "POST",
        body: { title, url, category, imageUrl, siteName, note: note || null },
      });
      setUrl("");
      setTitle("");
      setNote("");
      setImageUrl(null);
      setSiteName(null);
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">Drop a cool find</p>
      <div className="flex gap-2">
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link…" required />
        <Button type="button" variant="yellow" onClick={fetchDetails} disabled={fetching || !url} className="shrink-0">
          {fetching ? (
            "…"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="sparkles" size={14} /> Fetch
            </span>
          )}
        </Button>
      </div>

      {(imageUrl || siteName) && (
        <div className="flex items-center gap-3 border-2 border-ink bg-paper p-2">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-14 w-14 border-2 border-ink object-cover" />
          )}
          <span className="font-mono text-xs uppercase text-ink/60">{siteName ?? "preview"} ✓</span>
        </div>
      )}

      <Field label="What is it">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this find" required />
      </Field>
      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as (typeof COOL_FIND_CATEGORIES)[number])}
          className="w-full border-2 border-ink bg-card px-2 py-2 font-mono text-sm"
        >
          {COOL_FIND_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why it's worth a click… (optional)"
        maxLength={500}
      />
      {error && <p className="border-2 border-ink bg-accent-yellow px-3 py-2 text-sm font-bold">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? "Adding…" : "Share it"}
      </Button>
    </form>
  );
}
