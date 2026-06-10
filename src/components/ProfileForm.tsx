"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { AvatarPicker } from "@/components/AvatarPicker";

export function ProfileForm({
  initialName,
  initialVenmo,
  initialAvatarUrl,
}: {
  initialName: string;
  initialVenmo: string;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [venmo, setVenmo] = useState(initialVenmo);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: { displayName, venmoHandle: venmo || null, avatarUrl },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-5">
      <Field label="Display name">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={100}
        />
      </Field>
      <div>
        <span className="brutal-label">Avatar</span>
        <AvatarPicker name={displayName} value={avatarUrl} onChange={setAvatarUrl} />
      </div>
      <Field label="Venmo handle (shown on your Market listings)">
        <Input
          value={venmo}
          onChange={(e) => setVenmo(e.target.value)}
          placeholder="@your-venmo"
          maxLength={60}
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : saved ? "✓ Saved" : "Save profile"}
      </Button>
    </form>
  );
}
