"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function ItemActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: "finish" | "remove") {
    setBusy(true);
    try {
      if (action === "finish") {
        await api(`/api/nowplaying/${itemId}`, {
          method: "PATCH",
          body: { status: "finished" },
        });
      } else {
        await api(`/api/nowplaying/${itemId}`, { method: "DELETE" });
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        onClick={() => run("finish")}
        disabled={busy}
        title="Mark finished"
        className="brutal-press border-2 border-ink bg-accent-green px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
      >
        ✓ Done
      </button>
      <button
        onClick={() => run("remove")}
        disabled={busy}
        title="Remove"
        className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
      >
        ✕
      </button>
    </span>
  );
}
