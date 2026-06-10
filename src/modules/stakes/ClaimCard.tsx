"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { confettiBurst, confettiCelebrate } from "@/lib/confetti";
import { Avatar, Badge } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { StampOverlay, useActionStamp, type StampTone } from "@/components/ActionFx";
import { useCountdown } from "@/lib/useCountdown";

/** Live "resolves in 3d 4h" chip; goes urgent inside the final 24h. */
function DeadlineChip({ resolvesAt }: { resolvesAt: string }) {
  const t = useCountdown(resolvesAt);
  const urgent = t.ready && !t.done && t.ms < 86_400_000;
  return (
    <Badge
      className={`inline-flex items-center gap-1.5 tabular-nums ${
        urgent ? "bg-accent-punch text-white" : "bg-paper"
      }`}
    >
      <PixelIcon name="clock" size={13} />
      {t.ready ? `resolves in ${t.label}` : `resolves ${new Date(resolvesAt).toLocaleDateString()}`}
    </Badge>
  );
}

export type ClaimView = {
  id: string;
  text: string | null; // null = hidden from this viewer
  resolvesAt: string;
  hidden: boolean;
  creatorName: string;
  creatorAvatarUrl: string | null;
  counterpartyName: string | null;
  counterpartyAvatarUrl: string | null;
  stake: string | null;
  outcome: "right" | "wrong" | "void" | null;
  settledAt: string | null;
  fixture: {
    league: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    finished: boolean;
  } | null;
  pickTeam: string | null;
  canResolve: boolean;
  canOverride: boolean;
  canDelete: boolean;
  isParty: boolean;
};

export function ClaimCard({ claim }: { claim: ClaimView }) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const { stamp, fire, cardFxClass } = useActionStamp();

  const resolved = claim.outcome !== null;
  const overdue = !resolved && new Date(claim.resolvesAt) < new Date();

  async function act(
    fn: () => Promise<unknown>,
    stampText: string,
    tone: StampTone,
    leave: boolean
  ) {
    setBusy(true);
    try {
      await fn();
      fire(stampText, tone, { leave });
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  // Resolving moves the claim to The Record — stamp it, walk it off.
  const RESOLVE_STAMPS = {
    right: ["RIGHT ✓", "green"],
    wrong: ["WRONG ✗", "red"],
    void: ["VOID", "ink"],
  } as const;
  const resolve = (outcome: "right" | "wrong" | "void") =>
    act(
      () =>
        api(`/api/stakes/claims/${claim.id}`, { method: "PATCH", body: { outcome } }).then(
          () => outcome !== "void" && confettiBurst()
        ),
      RESOLVE_STAMPS[outcome][0],
      RESOLVE_STAMPS[outcome][1],
      true
    );
  const settle = () =>
    act(
      () => api(`/api/stakes/claims/${claim.id}/settle`, { method: "POST" }).then(confettiCelebrate),
      "SETTLED ✓",
      "green",
      false
    );

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    await act(
      () => api(`/api/stakes/claims/${claim.id}`, { method: "DELETE" }),
      "DELETED",
      "red",
      true
    );
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
    <li id={`claim-${claim.id}`} className={`brutal-card relative scroll-mt-24 p-4 ${resolved ? "opacity-80" : ""} ${cardFxClass}`}>
      <StampOverlay stamp={stamp} />
      <div className="flex flex-wrap items-center gap-1.5">
        {claim.counterpartyName ? (
          <Badge className="inline-flex items-center gap-1.5 bg-accent-forest text-white">
            <PixelIcon name="users" size={13} /> Bet
          </Badge>
        ) : (
          <Badge className="inline-flex items-center gap-1.5 bg-paper">
            <PixelIcon name="sparkles" size={13} /> Called it
          </Badge>
        )}
        {claim.fixture && (
          <Badge className="inline-flex items-center gap-1.5 bg-accent-orange">
            <PixelIcon name="trophy" size={13} /> {claim.fixture.league}
          </Badge>
        )}
        {claim.hidden && !resolved && (
          <Badge className="inline-flex items-center gap-1.5 bg-ink text-white">
            <PixelIcon name="sunglasses" size={13} /> Hidden
          </Badge>
        )}
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
        ) : overdue ? (
          <Badge className="inline-flex items-center gap-1.5 bg-accent-yellow">
            <PixelIcon name="clock" size={13} /> awaiting verdict
          </Badge>
        ) : (
          <DeadlineChip resolvesAt={claim.resolvesAt} />
        )}
      </div>

      <p className="mt-2 font-bold leading-snug">
        {claim.text ?? (
          <span className="italic text-ink/40">
            <PixelIcon name="lock" size={13} className="-mt-0.5 mr-1 inline" />
            Hidden until it resolves…
          </span>
        )}
      </p>
      <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase text-ink/40">
        <Avatar name={claim.creatorName} src={claim.creatorAvatarUrl} size="sm" />
        {claim.creatorName}
        {claim.counterpartyName && (
          <>
            {" vs "}
            <Avatar name={claim.counterpartyName} src={claim.counterpartyAvatarUrl} size="sm" />
            {claim.counterpartyName}
          </>
        )}
      </p>

      {claim.fixture &&
        (claim.fixture.finished ? (
          <p className="mt-2 inline-flex items-center gap-1.5 border-2 border-ink bg-ink px-2 py-1 font-mono text-xs font-bold tabular-nums text-white">
            <PixelIcon name="trophy" size={13} />
            {claim.fixture.homeTeam} {claim.fixture.homeScore ?? "–"} : {claim.fixture.awayScore ?? "–"} {claim.fixture.awayTeam}
            <span className="text-white/50">· oracle ruled</span>
          </p>
        ) : (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink/40">
            <PixelIcon name="zap" size={12} className="-mt-0.5 mr-1 inline" />
            Auto-settles from the final score
          </p>
        ))}

      {claim.stake && (
        <p className="mt-2 border-2 border-dashed border-ink/30 bg-paper px-2 py-1 font-mono text-xs">
          <PixelIcon name="zap" size={13} className="-mt-0.5 mr-1 inline" />
          Stake: {claim.stake}
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
                  <PixelIcon name="scale" size={12} className="-mt-0.5 mr-1 inline" />
                  → {o}
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
              <PixelIcon name="money" size={12} className="-mt-0.5 mr-1 inline" />
              Mark settled
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
