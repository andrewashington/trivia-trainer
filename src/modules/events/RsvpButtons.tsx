"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

const OPTIONS = [
  { status: "going", label: "Going", active: "bg-accent-green" },
  { status: "maybe", label: "Maybe", active: "bg-accent-yellow" },
  { status: "no", label: "Can't", active: "bg-accent-red text-white" },
] as const;

export function RsvpButtons({
  eventId,
  current,
}: {
  eventId: string;
  current: "going" | "maybe" | "no" | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: "going" | "maybe" | "no") {
    setBusy(true);
    try {
      await api(`/api/events/${eventId}/rsvp`, { method: "PUT", body: { status } });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "RSVP failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.status}
          disabled={busy}
          onClick={() => setStatus(opt.status)}
          className={`brutal-press flex-1 border-3 border-ink px-3 py-2 font-display font-bold uppercase shadow-brutal disabled:opacity-60 ${
            current === opt.status ? opt.active : "bg-card"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
