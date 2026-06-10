"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function ChallengeActions({
  challengeId,
  open,
  canManage,
}: {
  challengeId: string;
  open: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  if (!canManage) return null;

  async function close() {
    if (!closeArmed) {
      setCloseArmed(true);
      setTimeout(() => setCloseArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/challenges/${challengeId}/close`, { method: "POST" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Close failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      setTimeout(() => setDeleteArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/challenges/${challengeId}`, { method: "DELETE" });
      router.push("/challenges");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {open && (
        <button
          onClick={close}
          disabled={busy}
          className={`brutal-press border-2 border-ink px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
            closeArmed ? "bg-accent-rust text-white" : "bg-card"
          }`}
        >
          {closeArmed ? "Crown the winner?" : "Close now"}
        </button>
      )}
      <button
        onClick={remove}
        disabled={busy}
        className={`brutal-press border-2 border-ink px-2 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
          deleteArmed ? "bg-accent-red text-white" : "bg-card"
        }`}
      >
        {deleteArmed ? "Sure?" : "Delete"}
      </button>
    </div>
  );
}
