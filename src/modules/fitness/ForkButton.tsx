"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

/** Copy a program into your own cut, then land on it ready to rework. */
export function ForkButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function fork() {
    setBusy(true);
    try {
      const { plan } = await api<{ plan: { id: string } }>(`/api/fitness/plans/${planId}/fork`, {
        method: "POST",
      });
      router.push(`/pump/${plan.id}/edit`);
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" onClick={fork} disabled={busy}>
      {busy ? "Forking…" : "🔱 Fork your own cut"}
    </Button>
  );
}
