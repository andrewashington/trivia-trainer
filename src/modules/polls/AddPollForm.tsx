"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { POLL_TYPE_META } from "@/modules/polls/schema";
import { PixelIcon } from "@/components/icons";

type PollType = "single" | "multi" | "scale";

export function AddPollForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<PollType>("single");
  const [anonymous, setAnonymous] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [revealThreshold, setRevealThreshold] = useState(3);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setOption(i: number, v: string) {
    setOptions(options.map((o, idx) => (idx === i ? v : o)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          revealThreshold: sealed ? revealThreshold : null,
        },
      });
      setQuestion("");
      setOptions(["", ""]);
      setType("single");
      setAnonymous(false);
      setSealed(false);
      setRevealThreshold(3);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post the poll.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="yellow" onClick={() => setOpen(true)} className="w-full">
        + Ask the group
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <p className="brutal-label">New poll</p>
      <Field label="The question">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Tacos or pizza on Friday?"
          required
          maxLength={300}
        />
      </Field>

      <div className="flex gap-2">
        {(Object.keys(POLL_TYPE_META) as PollType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`brutal-press flex-1 border-2 border-ink px-2 py-1.5 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              type === t ? "bg-accent-indigo text-white" : "bg-card"
            }`}
          >
            <PixelIcon name={POLL_TYPE_META[t].icon} size={13} className="-mt-0.5 mr-1 inline" />
            {POLL_TYPE_META[t].label}
          </button>
        ))}
      </div>

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
        onClick={() => setSealed(!sealed)}
        aria-pressed={sealed}
        className={`brutal-press w-full border-2 border-ink px-3 py-2 text-left font-mono text-xs font-bold uppercase shadow-brutal-sm ${
          sealed ? "bg-accent-yellow" : "bg-card"
        }`}
      >
        <PixelIcon name={sealed ? "lock" : "unlock"} size={13} className="-mt-0.5 mr-1 inline" />
        {sealed
          ? "Sealed — results hidden until the group votes to reveal"
          : "Open results — tap to seal them behind a group vote"}
      </button>
      {sealed && (
        <Field label="Votes needed to reveal the results">
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
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Posting…" : "Open the polls"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
