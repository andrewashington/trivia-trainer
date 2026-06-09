"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Input } from "@/components/ui";

export function PetActions({ name, canNudge }: { name: string; canNudge: boolean }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [patted, setPatted] = useState(false);

  async function pat() {
    setBusy(true);
    try {
      await api("/api/pet/nudge", { method: "POST" });
      setPatted(true);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Pat failed?!");
    } finally {
      setBusy(false);
    }
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/pet", { method: "PATCH", body: { name: newName } });
      setRenaming(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  if (renaming) {
    return (
      <form onSubmit={rename} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} required />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? "…" : "Name it"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setRenaming(false)} className="shrink-0">
          ✕
        </Button>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="yellow"
        onClick={pat}
        disabled={busy || !canNudge || patted}
        className="flex-1"
      >
        {patted || !canNudge ? "🤚 Patted today ✓" : "🤚 Pat the pet"}
      </Button>
      <Button variant="ghost" onClick={() => setRenaming(true)} className="shrink-0">
        ✏️ Rename
      </Button>
    </div>
  );
}
