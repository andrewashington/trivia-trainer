"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

export type VaultEntryView = {
  id: string;
  siteName: string;
  siteUrl: string | null;
  username: string;
  notes: string | null;
  creatorName: string;
  canDelete: boolean;
};

function CopyChip({ getValue, label }: { getValue: () => Promise<string>; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function copy() {
    setState("busy");
    try {
      await navigator.clipboard.writeText(await getValue());
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      alert("Couldn't copy.");
      setState("idle");
    }
  }

  return (
    <button
      onClick={copy}
      disabled={state === "busy"}
      className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
    >
      {state === "done" ? "✓ Copied" : label}
    </button>
  );
}

export function VaultEntryRow({ entry }: { entry: VaultEntryView }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit state
  const [siteName, setSiteName] = useState(entry.siteName);
  const [siteUrl, setSiteUrl] = useState(entry.siteUrl ?? "");
  const [username, setUsername] = useState(entry.username);
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState(entry.notes ?? "");

  async function fetchPassword(): Promise<string> {
    const { password } = await api<{ password: string }>(`/api/vault/${entry.id}/reveal`);
    return password;
  }

  async function toggleReveal() {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    try {
      setRevealed(await fetchPassword());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't reveal.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/vault/${entry.id}`, {
        method: "PATCH",
        body: {
          siteName,
          siteUrl: siteUrl || null,
          username,
          notes: notes || null,
          ...(password ? { password } : {}),
        },
      });
      setEditing(false);
      setPassword("");
      setRevealed(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/vault/${entry.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="brutal-card p-4">
        <form onSubmit={save} className="space-y-3">
          <Field label="Site">
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
          </Field>
          <Field label="URL (optional)">
            <Input type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Username / email">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="New password (leave blank to keep current)">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
          </Field>
          <Field label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Profile: 'The Group', PIN is the usual" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="brutal-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight">
            🔑 {entry.siteName}
          </p>
          {entry.siteUrl && (
            <a
              href={entry.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-accent-blue"
            >
              {entry.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
            </a>
          )}
        </div>
        <span className="flex shrink-0 gap-1.5">
          <button
            onClick={() => setEditing(true)}
            className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
          >
            Edit
          </button>
          {entry.canDelete && (
            <button
              onClick={remove}
              disabled={busy}
              className={`brutal-press border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm ${
                armed ? "bg-accent-red text-white" : "bg-card"
              }`}
            >
              {armed ? "Sure?" : "✕"}
            </button>
          )}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 font-mono text-sm">
        <div className="flex items-center gap-2">
          <span className="text-ink/50">user</span>
          <span className="truncate font-bold">{entry.username}</span>
          <CopyChip label="Copy" getValue={async () => entry.username} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink/50">pass</span>
          <span className="truncate font-bold">{revealed ?? "••••••••"}</span>
          <button
            onClick={toggleReveal}
            className="brutal-press border-2 border-ink bg-accent-cyan px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
          >
            {revealed !== null ? "Hide" : "Reveal"}
          </button>
          <CopyChip label="Copy" getValue={fetchPassword} />
        </div>
      </div>

      {entry.notes && <p className="mt-2 text-sm italic text-ink/60">{entry.notes}</p>}
      <p className="mt-2 font-mono text-[10px] uppercase text-ink/40">
        added by {entry.creatorName}
      </p>
    </li>
  );
}
