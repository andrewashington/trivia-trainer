"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { PlanDraftEditor } from "@/modules/fitness/ForgeClient";
import type { PlanDraft } from "@/modules/fitness/normalize";

export function EditPlanClient({ planId, initial }: { planId: string; initial: PlanDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/fitness/plans/${planId}`, {
        method: "PATCH",
        body: {
          title: draft.title,
          blurb: draft.blurb,
          goal: draft.goal,
          daysPerWeek: draft.daysPerWeek,
          equipment: draft.equipment,
          doc: draft.doc,
        },
      });
      router.push(`/pump/${planId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PlanDraftEditor draft={draft} onChange={setDraft} />
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">{error}</p>
      )}
      <Button onClick={save} disabled={busy} className="w-full !bg-accent-bronze !text-ink">
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
