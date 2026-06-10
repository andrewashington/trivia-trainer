"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";

const EMOJI_PICKS = ["🚀", "✈️", "🎂", "🎮", "🎬", "🏝️", "💍", "🏟️", "🍕", "👶"];

export function AddCountdownForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [targetAt, setTargetAt] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/countdowns", {
        method: "POST",
        body: {
          title,
          emoji: emoji || null,
          targetAt: new Date(targetAt).toISOString(),
          link: link || null,
        },
      });
      closeForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the clock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="font-mono text-[11px] text-ink/50">
        Anything worth waiting for. The whole group watches it tick.
      </p>
      <Field label="What's coming">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The trip, the album drop, the closing date…"
          required
          maxLength={120}
        />
      </Field>
      <Field label="When it lands">
        <Input
          type="datetime-local"
          value={targetAt}
          onChange={(e) => setTargetAt(e.target.value)}
          required
        />
      </Field>
      <Field label="Emoji (optional)">
        <div className="flex flex-wrap items-center gap-1.5">
          {EMOJI_PICKS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(emoji === e ? "" : e)}
              className={`brutal-press border-2 border-ink px-2 py-1 text-lg shadow-brutal-sm ${
                emoji === e ? "bg-accent-punch" : "bg-card"
              }`}
            >
              {e}
            </button>
          ))}
          <span className="w-28">
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="or type one"
              maxLength={8}
            />
          </span>
        </div>
      </Field>
      <Field label="Link (optional)">
        <Input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Starting…" : "Start the clock"}
      </Button>
    </form>
  );
}
