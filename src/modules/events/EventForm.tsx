"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field, Input, Textarea } from "@/components/ui";

type EventShape = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
};

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm({ event }: { event?: EventShape }) {
  const router = useRouter();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startAt, setStartAt] = useState(toLocalInput(event?.startAt ?? null));
  const [endAt, setEndAt] = useState(toLocalInput(event?.endAt ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title,
      description: description || null,
      location: location || null,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : null,
    };
    try {
      if (event) {
        await api(`/api/events/${event.id}`, { method: "PATCH", body });
        router.push(`/events/${event.id}`);
      } else {
        const created = await api<{ event: { id: string } }>("/api/events", {
          method: "POST",
          body,
        });
        router.push(`/events/${created.event.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="brutal-card space-y-4 p-5">
      <Field label="What's happening">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Game night, hot pot, lake day…"
          required
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </Field>
        <Field label="Ends (optional)">
          <Input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Where (optional)">
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Dave's place / that one park"
        />
      </Field>
      <Field label="Details (optional)">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Bring snacks. BYO controller."
        />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : event ? "Save changes" : "Put it on the calendar"}
      </Button>
    </form>
  );
}
