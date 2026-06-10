"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { useCloseModuleForm } from "@/components/ModuleHeader";

export function NewChallengeForm() {
  const router = useRouter();
  const closeForm = useCloseModuleForm();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/challenges", {
        method: "POST",
        body: {
          title,
          description: description.trim() || null,
          // datetime-local gives a local wall-clock string; toISOString
          // pins it to a real instant.
          deadline: deadline ? new Date(deadline).toISOString() : null,
        },
      });
      setTitle("");
      setDescription("");
      setDeadline("");
      router.refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="The challenge">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sneakiest pic of Dave wins"
          required
          maxLength={200}
        />
      </Field>
      <Field label="Rules / details (optional)">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What counts, what doesn't, how to win"
          maxLength={2000}
        />
      </Field>
      <Field label="Deadline (optional — auto-closes and crowns the winner)">
        <Input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" variant="yellow" disabled={busy || !title.trim()} className="w-full">
        {busy ? "Posting…" : "Throw it down"}
      </Button>
    </form>
  );
}
