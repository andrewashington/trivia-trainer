"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import type { TanksGamePayload } from "@/modules/tanks/server";

type Member = { id: string; displayName: string };

export function ChallengeForm({ members }: { members: Member[] }) {
  const router = useRouter();
  const [opponentId, setOpponentId] = useState(members[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challenge = async () => {
    if (!opponentId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ game: TanksGamePayload }>("/api/arcade/tanks", {
        method: "POST",
        body: { opponentId },
      });
      router.push(`/tanks/${res.game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the duel.");
      setBusy(false);
    }
  };

  if (members.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        Nobody to fight — you need at least one other member in the group.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="brutal-label">Opponent</span>
          <select
            value={opponentId}
            onChange={(e) => setOpponentId(e.target.value)}
            className="brutal-input"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={challenge} disabled={busy} variant="danger">
          {busy ? "Loading…" : "Challenge"}
        </Button>
      </div>
      {error && (
        <p className="border-2 border-ink bg-accent-red/15 px-2 py-1 font-mono text-xs">{error}</p>
      )}
    </div>
  );
}
