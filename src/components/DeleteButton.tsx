"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

/**
 * Two-tap delete: first tap arms ("Really?"), second tap commits.
 * Brutalist-honest and accident-proof without a modal.
 */
export function DeleteButton({
  endpoint,
  redirectTo,
  label = "Delete",
}: {
  endpoint: string;
  redirectTo?: string;
  label?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(endpoint, { method: "DELETE" });
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setArmed(false);
    }
  }

  return (
    <Button variant={armed ? "danger" : "ghost"} onClick={onClick} disabled={busy}>
      {busy ? "…" : armed ? "Really?" : label}
    </Button>
  );
}
