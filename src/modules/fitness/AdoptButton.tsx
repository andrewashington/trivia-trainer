"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

/** "Run it" / "Abandon" — the same adoption the Discord button fires. */
export function AdoptButton({ planId, adopted }: { planId: string; adopted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api(`/api/fitness/plans/${planId}/adopt`, { method: adopted ? "DELETE" : "POST" });
    } catch {
      // 409 (already running) or a deleted plan — the refresh sorts the UI out.
    }
    router.refresh();
    setBusy(false);
  }

  return adopted ? (
    <Button variant="ghost" onClick={toggle} disabled={busy}>
      {busy ? "…" : "Abandon program"}
    </Button>
  ) : (
    <Button onClick={toggle} disabled={busy} className="!bg-accent-bronze !text-ink">
      {busy ? "…" : "🏃 Run this program"}
    </Button>
  );
}
