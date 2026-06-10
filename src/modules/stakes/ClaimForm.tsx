"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { useCloseModuleForm } from "@/components/ModuleHeader";

export function ClaimForm({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
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
      closeForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't lock that in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="font-mono text-[11px] text-ink/50">
        A prediction about the real world — it locks the moment you post it, and
        reality (plus a verdict) settles it.
      </p>
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
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? (
          "…"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <PixelIcon name="lock" size={14} /> Lock it in
          </span>
        )}
      </Button>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
        Just want a group vote? <Link href="/polls" className="font-bold underline">Polls</Link> ·
        Blind answers? <Link href="/reveal" className="font-bold underline">Reveal</Link>
      </p>
    </form>
  );
}
