"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { POLL_TYPE_META } from "@/modules/polls/schema";
import { PixelIcon } from "@/components/icons";
import { useCloseModuleForm } from "@/components/ModuleHeader";

type PollType = "single" | "multi" | "scale";

const TYPE_BLURBS: Record<PollType, string> = {
  single: "One vote each. Settles it.",
  multi: "Check all that apply.",
  scale: "Everyone rates it 1–5; you get the spread.",
};

export function AddPollForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  // Wizard: pick the kind of poll first, then write it.
  const [type, setType] = useState<PollType | null>(null);
  const [question, setQuestion] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [blind, setBlind] = useState(false);
  const [revealThreshold, setRevealThreshold] = useState(3);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setOption(i: number, v: string) {
    setOptions(options.map((o, idx) => (idx === i ? v : o)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/polls", {
        method: "POST",
        body: {
          question,
          type,
          anonymous,
          options: type === "scale" ? [] : options.map((o) => o.trim()).filter(Boolean),
          revealThreshold: blind ? revealThreshold : null,
        },
      });
      closeForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post the poll.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 1: what kind of poll? ----
  if (!type) {
    return (
      <div className="space-y-3">
        {(Object.keys(POLL_TYPE_META) as PollType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className="brutal-press block w-full border-2 border-ink bg-card px-4 py-3 text-left shadow-brutal-sm"
          >
            <span className="flex items-center gap-2 font-display font-bold uppercase">
              <PixelIcon name={POLL_TYPE_META[t].icon} size={16} />
              {POLL_TYPE_META[t].label}
            </span>
            <span className="mt-1 block font-mono text-[11px] text-ink/60">{TYPE_BLURBS[t]}</span>
          </button>
        ))}
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
          Want blind answers, unmasked together? <Link href="/reveal" className="font-bold underline">Reveal</Link> ·
          Betting on an outcome? <Link href="/stakes" className="font-bold underline">Stakes</Link>
        </p>
      </div>
    );
  }

  // ---- Step 2: write the poll ----
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <button
        type="button"
        onClick={() => setType(null)}
        className="brutal-press border-2 border-ink bg-paper px-2 py-1 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
      >
        ← {POLL_TYPE_META[type].label}
      </button>

      <Field label="The question">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Tacos or pizza on Friday?"
          required
          maxLength={300}
        />
      </Field>

      {type !== "scale" && (
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={120}
                required={i < 2}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                  className="brutal-press shrink-0 border-2 border-ink bg-card px-2 font-mono text-xs font-bold shadow-brutal-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOptions([...options, ""])}
              className="w-full !py-1 text-sm"
            >
              + Option
            </Button>
          )}
        </div>
      )}
      {type === "scale" && (
        <p className="border-2 border-dashed border-ink/30 bg-paper px-3 py-2 font-mono text-xs text-ink/60">
          Voters rate 1–5. Great for &ldquo;how spicy should chili night be?&rdquo;
        </p>
      )}

      <button
        type="button"
        onClick={() => setAnonymous(!anonymous)}
        aria-pressed={anonymous}
        className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
          anonymous ? "bg-ink text-white" : "bg-card"
        }`}
      >
        <PixelIcon name={anonymous ? "sunglasses" : "eye"} size={13} className="-mt-0.5 mr-1 inline" />
        {anonymous
          ? "Anonymous — nobody sees who voted for what"
          : "Named — votes show names (tap for anonymous)"}
      </button>

      <button
        type="button"
        onClick={() => setBlind(!blind)}
        aria-pressed={blind}
        className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
          blind ? "bg-accent-yellow" : "bg-card"
        }`}
      >
        <PixelIcon name={blind ? "lock" : "unlock"} size={13} className="-mt-0.5 mr-1 inline" />
        {blind
          ? "Blind voting — results hidden until the group votes to show them"
          : "Open results — tap for blind voting (no anchoring)"}
      </button>
      {blind && (
        <Field label="Votes needed to show the results">
          <Input
            type="number"
            min={2}
            max={50}
            value={revealThreshold}
            onChange={(e) => setRevealThreshold(Number(e.target.value))}
            required
          />
        </Field>
      )}

      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Posting…" : "Open the polls"}
      </Button>
    </form>
  );
}
