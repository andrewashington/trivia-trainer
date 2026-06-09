"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { REVEAL_TYPE_META } from "@/modules/reveal/schema";

type Mode = "rank" | "sealed" | "oracle";

export function AddPromptForm({ memberNames }: { memberNames: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("rank");
  const [title, setTitle] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [scaleMax, setScaleMax] = useState(10);
  const [deadline, setDeadline] = useState("");
  const [unlockAt, setUnlockAt] = useState("");
  const [sealedBody, setSealedBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          scaleMax: mode === "oracle" ? scaleMax : undefined,
          deadline: mode !== "sealed" && deadline ? new Date(deadline).toISOString() : undefined,
          unlockAt: mode === "sealed" && unlockAt ? new Date(unlockAt).toISOString() : undefined,
          sealedBody: mode === "sealed" ? sealedBody : undefined,
        },
      });
      setTitle("");
      setItemsText("");
      setSealedBody("");
      setDeadline("");
      setUnlockAt("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="yellow" onClick={() => setOpen(true)} className="w-full">
        + Start a reveal
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-3 p-4">
      <div className="flex gap-2">
        {(Object.keys(REVEAL_TYPE_META) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`brutal-press flex-1 border-2 border-ink px-2 py-1.5 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              mode === m ? "bg-ink text-white" : "bg-card"
            }`}
          >
            {REVEAL_TYPE_META[m].icon} {REVEAL_TYPE_META[m].label}
          </button>
        ))}
      </div>
      <p className="font-mono text-[11px] text-ink/50">{REVEAL_TYPE_META[mode].blurb}</p>

      <Field label={mode === "sealed" ? "Title (visible while sealed)" : "The prompt"}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            mode === "rank"
              ? "Most → least likely to flake"
              : mode === "oracle"
                ? "Pineapple on pizza, 1–10"
                : "Open on New Year's Eve"
          }
          required
          maxLength={300}
        />
      </Field>

      {mode === "rank" && (
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
              👥 Rank the group
            </button>
          </div>
        </Field>
      )}

      {mode === "oracle" && (
        <Field label="Scale tops out at">
          <div className="flex gap-2">
            {[5, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScaleMax(n)}
                className={`brutal-press flex-1 border-2 border-ink py-1.5 font-display font-bold shadow-brutal-sm ${
                  scaleMax === n ? "bg-ink text-white" : "bg-card"
                }`}
              >
                1–{n}
              </button>
            ))}
          </div>
        </Field>
      )}

      {mode !== "sealed" && (
        <Field label="Reveal deadline (optional — otherwise when everyone's in)">
          <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
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
        </>
      )}

      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">{error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "…" : mode === "sealed" ? "Seal it" : "Open it up"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
