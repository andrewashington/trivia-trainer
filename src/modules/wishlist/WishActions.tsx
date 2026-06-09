"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function WishActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/wishlist/${itemId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className={`brutal-press shrink-0 border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm ${
        armed ? "bg-accent-red text-white" : "bg-card"
      }`}
    >
      {armed ? "Sure?" : "✕"}
    </button>
  );
}
