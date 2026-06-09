"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Badge } from "@/components/ui";

export type ClaimView = {
  id: string;
  text: string | null; // null = hidden from this viewer
  resolvesAt: string;
  hidden: boolean;
  creatorName: string;
  counterpartyName: string | null;
  stake: string | null;
  outcome: "right" | "wrong" | "void" | null;
  settledAt: string | null;
  canResolve: boolean;
  canOverride: boolean;
  canDelete: boolean;
  isParty: boolean;
};

export function ClaimCard({ claim }: { claim: ClaimView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const resolved = claim.outcome !== null;
  const overdue = !resolved && new Date(claim.resolvesAt) < new Date();

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const resolve = (outcome: "right" | "wrong" | "void") =>
    act(() => api(`/api/stakes/claims/${claim.id}`, { method: "PATCH", body: { outcome } }));
  const settle = () =>
    act(() => api(`/api/stakes/claims/${claim.id}/settle`, { method: "POST" }));

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    await act(() => api(`/api/stakes/claims/${claim.id}`, { method: "DELETE" }));
  }

  // Who owes whom, if a stake rode on it.
  const loserName =
    claim.outcome === "right"
      ? claim.counterpartyName
      : claim.outcome === "wrong"
        ? claim.creatorName
        : null;
  const winnerName =
    claim.outcome === "right"
      ? claim.creatorName
      : claim.outcome === "wrong"
        ? claim.counterpartyName
        : null;

  return (
    <li className={`brutal-card p-4 ${resolved ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {claim.counterpartyName ? (
          <Badge className="bg-accent-forest text-white">🤝 Bet</Badge>
        ) : (
          <Badge className="bg-paper">🔮 Called it</Badge>
        )}
        {claim.hidden && !resolved && <Badge className="bg-ink text-white">🕶️ Hidden</Badge>}
        {resolved ? (
          <Badge
            className={
              claim.outcome === "right"
                ? "bg-accent-green"
                : claim.outcome === "wrong"
                  ? "bg-accent-red text-white"
                  : "bg-paper"
            }
          >
            {claim.outcome === "right" ? "✓ RIGHT" : claim.outcome === "wrong" ? "✗ WRONG" : "VOID"}
          </Badge>
        ) : (
          <Badge className={overdue ? "bg-accent-yellow" : "bg-paper"}>
            {overdue ? "⏰ awaiting verdict" : `resolves ${new Date(claim.resolvesAt).toLocaleDateString()}`}
          </Badge>
        )}
      </div>

      <p className="mt-2 font-bold leading-snug">
        {claim.text ?? <span className="italic text-ink/40">🔒 Hidden until it resolves…</span>}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase text-ink/40">
        {claim.creatorName}
        {claim.counterpartyName && ` vs ${claim.counterpartyName}`}
      </p>

      {claim.stake && (
        <p className="mt-2 border-2 border-dashed border-ink/30 bg-paper px-2 py-1 font-mono text-xs">
          💪 Stake: {claim.stake}
          {resolved && loserName && (
            <>
              {" — "}
              <strong>
                {claim.settledAt
                  ? `${loserName} paid up ✓`
                  : `${loserName} owes ${winnerName}`}
              </strong>
            </>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!resolved && claim.canResolve && (
          <>
            <button
              onClick={() => resolve("right")}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-accent-green px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
            >
              ✓ It happened
            </button>
            <button
              onClick={() => resolve("wrong")}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-accent-red px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white shadow-brutal-sm"
            >
              ✗ Nope
            </button>
            <button
              onClick={() => resolve("void")}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
            >
              Void
            </button>
          </>
        )}
        {resolved && claim.canOverride && (
          <>
            {(["right", "wrong", "void"] as const)
              .filter((o) => o !== claim.outcome)
              .map((o) => (
                <button
                  key={o}
                  onClick={() => resolve(o)}
                  disabled={busy}
                  className="brutal-press border-2 border-ink bg-accent-grape px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white shadow-brutal-sm"
                >
                  ⚖️ → {o}
                </button>
              ))}
          </>
        )}
        {resolved &&
          claim.stake &&
          claim.outcome !== "void" &&
          !claim.settledAt &&
          claim.isParty && (
            <button
              onClick={settle}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-accent-yellow px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
            >
              💸 Mark settled
            </button>
          )}
        {claim.canDelete && (
          <button
            onClick={remove}
            disabled={busy}
            className={`brutal-press ml-auto border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
              armed ? "bg-accent-red text-white" : "bg-card"
            }`}
          >
            {armed ? "Sure?" : "✕"}
          </button>
        )}
      </div>
    </li>
  );
}
