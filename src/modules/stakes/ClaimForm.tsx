"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { PixelIcon } from "@/components/icons";

export function ClaimForm({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [resolvesAt, setResolvesAt] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [stake, setStake] = useState("");
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/stakes/claims", {
        method: "POST",
        body: {
          text,
          resolvesAt: new Date(resolvesAt).toISOString(),
          counterpartyId: counterpartyId || null,
          stake: stake || null,
          hidden: counterpartyId ? false : hidden,
        },
      });
      setText("");
      setResolvesAt("");
      setCounterpartyId("");
      setStake("");
      setHidden(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't lock that in.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="yellow" onClick={() => setOpen(true)} className="w-full">
        + Call a shot
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">New claim — locks the moment you post it</p>
      <Field label="The claim">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dave will be 20+ min late to game night"
          required
          maxLength={500}
        />
      </Field>
      <Field label="Resolves by">
        <Input
          type="datetime-local"
          value={resolvesAt}
          onChange={(e) => setResolvesAt(e.target.value)}
          required
        />
      </Field>
      <Field label="Against someone? (makes it a bet)">
        <select
          value={counterpartyId}
          onChange={(e) => setCounterpartyId(e.target.value)}
          className="brutal-input"
        >
          <option value="">Nobody — just a prediction</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {counterpartyId && (
        <Field label="The stake (a favor or chore — never money)">
          <Input
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Loser buys coffee / does the dishes"
            maxLength={300}
          />
        </Field>
      )}
      {!counterpartyId && (
        <button
          type="button"
          onClick={() => setHidden(!hidden)}
          aria-pressed={hidden}
          className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
            hidden ? "bg-ink text-white" : "bg-card"
          }`}
        >
          <PixelIcon name={hidden ? "sunglasses" : "eye"} size={13} className="-mt-0.5 mr-1 inline" />
          {hidden
            ? "Hidden until it resolves — maximum smug"
            : "Visible now (tap to hide until resolution)"}
        </button>
      )}
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? (
            "…"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="lock" size={14} /> Lock it in
            </span>
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
