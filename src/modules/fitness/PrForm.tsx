"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

/**
 * Claim a feat of strength. A claim that doesn't beat the ledger's best
 * comes back 400 with a taunt — which is shown at full volume, because
 * that's half the feature.
 */
export function PrForm() {
  const router = useRouter();
  const [lift, setLift] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("1");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api("/api/fitness/prs", {
        method: "POST",
        body: {
          lift,
          weight: Number(weight),
          reps: Number(reps) || 1,
          unit,
          note: note || null,
        },
      });
      setDone(`On the Wall: ${lift} ${weight} ${unit}${Number(reps) > 1 ? ` × ${reps}` : ""}.`);
      setLift("");
      setWeight("");
      setReps("1");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Wall rejected that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2">
          <Field label="Lift">
            <Input value={lift} onChange={(e) => setLift(e.target.value)} placeholder="Bench" required />
          </Field>
        </div>
        <Field label="Weight">
          <Input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="225"
            required
          />
        </Field>
        <Field label="Reps">
          <Input value={reps} onChange={(e) => setReps(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Unit">
          <select
            className="brutal-input"
            value={unit}
            onChange={(e) => setUnit(e.target.value === "kg" ? "kg" : "lb")}
          >
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        </Field>
      </div>
      <Field label="Witness statement (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="belt, no spot, minor screaming" />
      </Field>
      {error && (
        <p className="border-2 border-ink bg-accent-red px-3 py-2 text-sm font-bold text-white">{error}</p>
      )}
      {done && (
        <p className="border-2 border-ink bg-accent-yellow px-3 py-2 font-mono text-xs font-bold uppercase">
          🏆 {done}
        </p>
      )}
      <Button type="submit" disabled={busy} className="!bg-accent-bronze !text-ink">
        {busy ? "Weighing the claim…" : "Claim the PR"}
      </Button>
    </form>
  );
}

/** Tiny inline retraction for your own ledger rows. */
export function PrDeleteButton({ prId }: { prId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      title="Retract this feat"
      disabled={busy}
      className="text-ink/40 hover:text-accent-red"
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/fitness/prs/${prId}`, { method: "DELETE" });
        } catch {
          /* already gone */
        }
        router.refresh();
      }}
    >
      ✕
    </button>
  );
}
