"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { defaultAvatarConfig, type AvatarConfig } from "@/lib/avatar";

export function ProfileForm({
  initialName,
  initialVenmo,
  initialAvatarConfig,
}: {
  initialName: string;
  initialVenmo: string;
  initialAvatarConfig: AvatarConfig | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [venmo, setVenmo] = useState(initialVenmo);
  const [avatar, setAvatar] = useState<AvatarConfig>(
    initialAvatarConfig ?? defaultAvatarConfig(initialName),
  );
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
        body: { displayName, venmoHandle: venmo || null, avatarConfig: avatar },
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
        <AvatarBuilder name={displayName} value={avatar} onChange={setAvatar} />
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
