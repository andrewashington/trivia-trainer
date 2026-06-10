"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { REVEAL_TYPE_META } from "@/modules/reveal/schema";
import { PixelIcon } from "@/components/icons";
import { useCloseModuleForm } from "@/components/ModuleHeader";

type Mode = "rank" | "sealed";

export function AddPromptForm({ memberNames }: { memberNames: string[] }) {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  // Wizard: pick what you're making first, then fill in the details.
  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [unlockAt, setUnlockAt] = useState("");
  const [sealedBody, setSealedBody] = useState("");
  const [earlyUnseal, setEarlyUnseal] = useState(false);
  const [unlockVotesNeeded, setUnlockVotesNeeded] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/reveal", {
        method: "POST",
        body: {
          type: mode,
          title,
          items:
            mode === "rank"
              ? itemsText.split("\n").map((s) => s.trim()).filter(Boolean)
              : undefined,
          deadline: mode !== "sealed" && deadline ? new Date(deadline).toISOString() : undefined,
          unlockAt: mode === "sealed" && unlockAt ? new Date(unlockAt).toISOString() : undefined,
          sealedBody: mode === "sealed" ? sealedBody : undefined,
          unlockVotesNeeded: mode === "sealed" && earlyUnseal ? unlockVotesNeeded : null,
        },
      });
      closeForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 1: what are you making? ----
  if (!mode) {
    return (
      <div className="space-y-3">
        {(Object.keys(REVEAL_TYPE_META) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="brutal-press block w-full border-2 border-ink bg-card px-4 py-3 text-left shadow-brutal-sm"
          >
            <span className="flex items-center gap-2 font-display font-bold uppercase">
              <PixelIcon name={REVEAL_TYPE_META[m].icon} size={16} />
              {REVEAL_TYPE_META[m].label}
            </span>
            <span className="mt-1 block font-mono text-[11px] text-ink/60">
              {REVEAL_TYPE_META[m].blurb}
            </span>
          </button>
        ))}
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
          Need a group decision? <Link href="/polls" className="font-bold underline">Polls</Link> · Betting
          on the future? <Link href="/stakes" className="font-bold underline">Stakes</Link>
        </p>
      </div>
    );
  }

  // ---- Step 2: the details ----
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <button
        type="button"
        onClick={() => setMode(null)}
        className="brutal-press border-2 border-ink bg-paper px-2 py-1 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
      >
        ← {REVEAL_TYPE_META[mode].label}
      </button>

      <Field label={mode === "sealed" ? "Title (visible while sealed)" : "The prompt"}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={mode === "rank" ? "Most → least likely to flake" : "Open on New Year's Eve"}
          required
          maxLength={300}
        />
      </Field>

      {mode === "rank" && (
        <>
          <Field label="Things to rank (one per line)">
            <div className="space-y-2">
              <Textarea
                value={itemsText}
                onChange={(e) => setItemsText(e.target.value)}
                rows={4}
                placeholder={"Dave\nSam\nAlex\n…"}
              />
              <button
                type="button"
                onClick={() => setItemsText(memberNames.join("\n"))}
                className="brutal-press border-2 border-ink bg-accent-yellow px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm"
              >
                <PixelIcon name="users" size={13} className="-mt-0.5 mr-1 inline" />
                Rank the group
              </button>
            </div>
          </Field>
          <Field label="Reveal deadline (optional — otherwise when everyone's in)">
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </>
      )}

      {mode === "sealed" && (
        <>
          <Field label="The note (sealed the moment you post)">
            <Textarea
              value={sealedBody}
              onChange={(e) => setSealedBody(e.target.value)}
              rows={4}
              placeholder="Future us: …"
              required
            />
          </Field>
          <Field label="Opens on">
            <Input type="datetime-local" value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} required />
          </Field>
          <button
            type="button"
            onClick={() => setEarlyUnseal(!earlyUnseal)}
            aria-pressed={earlyUnseal}
            className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              earlyUnseal ? "bg-accent-yellow" : "bg-card"
            }`}
          >
            <PixelIcon name={earlyUnseal ? "unlock" : "lock"} size={13} className="-mt-0.5 mr-1 inline" />
            {earlyUnseal
              ? "Early unseal ON — the group can vote it open sooner"
              : "Date only — tap to let a group vote open it early"}
          </button>
          {earlyUnseal && (
            <Field label="Votes needed to unseal early">
              <Input
                type="number"
                min={2}
                max={50}
                value={unlockVotesNeeded}
                onChange={(e) => setUnlockVotesNeeded(Number(e.target.value))}
                required
              />
            </Field>
          )}
        </>
      )}

      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">{error}</p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "…" : mode === "sealed" ? "Seal it" : "Open it up"}
      </Button>
    </form>
  );
}
