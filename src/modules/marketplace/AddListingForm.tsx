"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";

const DELIVERY_OPTIONS = [
  { value: "pickup", label: "🚪 Pickup" },
  { value: "delivery", label: "🚗 I'll deliver" },
  { value: "either", label: "🤝 Either" },
] as const;

export function AddListingForm({ hasVenmo }: { hasVenmo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(""); // dollars; blank = free
  const [delivery, setDelivery] = useState<"pickup" | "delivery" | "either">("pickup");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null;
    const { key, uploadUrl } = await api<{ key: string; uploadUrl: string }>(
      "/api/marketplace/image",
      { method: "POST", body: { mimeType: imageFile.type } }
    );
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": imageFile.type },
      body: imageFile,
    });
    if (!put.ok) throw new Error("Image upload failed.");
    return key;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dollars = price.trim() === "" ? null : Number(price);
      if (dollars !== null && (Number.isNaN(dollars) || dollars < 0)) {
        throw new Error("Price needs to be a number (or blank for free).");
      }
      const imageKey = await uploadImage();
      await api("/api/marketplace", {
        method: "POST",
        body: {
          title,
          description: description || null,
          priceCents: dollars === null ? null : Math.round(dollars * 100),
          delivery,
          imageKey,
        },
      });
      setTitle("");
      setDescription("");
      setPrice("");
      setImageFile(null);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't list that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button variant="yellow" onClick={() => setOpen(true)} className="w-full">
          + Sell (or give away) something
        </Button>
        {!hasVenmo && (
          <p className="font-mono text-[11px] text-ink/50">
            Tip: add your Venmo handle on your{" "}
            <a href="/me" className="font-bold text-accent-blue">
              profile
            </a>{" "}
            so buyers can pay you.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">New listing</p>
      <Field label="What is it">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Used toaster, works great, slightly haunted" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price ($, blank = free)">
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="FREE"
          />
        </Field>
        <Field label="Handoff">
          <div className="flex flex-col gap-1.5">
            {DELIVERY_OPTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDelivery(d.value)}
                className={`brutal-press border-2 border-ink px-2 py-1 text-left font-mono text-xs font-bold shadow-brutal-sm ${
                  delivery === d.value ? "bg-accent-magenta text-white" : "bg-card"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Details (optional)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Condition, dimensions, backstory…" />
      </Field>
      <Field label="Photo (optional)">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="brutal-input file:mr-3 file:border-2 file:border-ink file:bg-accent-yellow file:px-3 file:py-1 file:font-display file:font-bold file:uppercase"
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Listing…" : "List it"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
