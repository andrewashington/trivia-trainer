"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Input } from "@/components/ui";

type SpinResult = {
  forfeit: { text: string };
  target: { displayName: string };
};

export function Wheel({
  members,
  forfeitCount,
}: {
  members: { id: string; name: string }[];
  forfeitCount: number;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [newForfeit, setNewForfeit] = useState("");
  const [busy, setBusy] = useState(false);

  async function spin() {
    if (!targetId) return;
    setSpinning(true);
    setResult(null);
    try {
      // Let the suspense build — the wheel "spins" for a beat.
      const [res] = await Promise.all([
        api<{ spin: SpinResult }>("/api/stakes/wheel", {
          method: "POST",
          body: { targetId, reason: reason || null },
        }),
        new Promise((r) => setTimeout(r, 1200)),
      ]);
      setResult(res.spin);
      setReason("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "The wheel jammed.");
    } finally {
      setSpinning(false);
    }
  }

  async function addForfeit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/stakes/forfeits", { method: "POST", body: { text: newForfeit } });
      setNewForfeit("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brutal-card space-y-3 p-4">
      <p className="brutal-label">☸️ The Forfeit Wheel</p>

      <div
        className={`flex h-24 items-center justify-center border-3 border-ink text-center ${
          spinning ? "animate-wiggle bg-accent-yellow" : result ? "bg-accent-forest" : "bg-paper"
        }`}
      >
        {spinning ? (
          <span className="font-display text-2xl font-bold">☸️ spinning…</span>
        ) : result ? (
          <div className="animate-pop-in px-3 text-white">
            <p className="font-display text-lg font-bold leading-tight">{result.forfeit.text}</p>
            <p className="mt-0.5 font-mono text-xs uppercase">→ {result.target.displayName}</p>
          </div>
        ) : (
          <span className="font-mono text-xs uppercase text-ink/40">
            {forfeitCount} fate{forfeitCount === 1 ? "" : "s"} in the pool
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="brutal-input"
        >
          <option value="">Who spins their fate?</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Button
          variant="danger"
          onClick={spin}
          disabled={spinning || !targetId || forfeitCount === 0}
          className="shrink-0"
        >
          SPIN
        </Button>
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (lost a bet, flaked again…)"
        maxLength={300}
      />

      <form onSubmit={addForfeit} className="flex gap-2 border-t-2 border-dashed border-ink/30 pt-3">
        <Input
          value={newForfeit}
          onChange={(e) => setNewForfeit(e.target.value)}
          placeholder="Add a dare to the pool…"
          maxLength={300}
          required
        />
        <Button type="submit" variant="yellow" disabled={busy} className="shrink-0">
          +
        </Button>
      </form>
    </div>
  );
}
