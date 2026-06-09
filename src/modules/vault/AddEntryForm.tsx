"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

export function AddEntryForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/vault", {
        method: "POST",
        body: {
          siteName,
          siteUrl: siteUrl || null,
          username,
          password,
          notes: notes || null,
        },
      });
      setSiteName("");
      setSiteUrl("");
      setUsername("");
      setPassword("");
      setNotes("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="yellow" onClick={() => setOpen(true)} className="w-full">
        + Add a shared login
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">New shared login</p>
      <Field label="Site">
        <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Netflix" required />
      </Field>
      <Field label="URL (optional)">
        <Input type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://netflix.com" />
      </Field>
      <Field label="Username / email">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
      </Field>
      <Field label="Password">
        <Input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="off"
        />
      </Field>
      <Field label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Use the 'Friends' profile" />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Saving…" : "Lock it in"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
