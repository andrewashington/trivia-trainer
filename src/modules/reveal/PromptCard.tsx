"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge, Button } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { StampOverlay, useActionStamp } from "@/components/ActionFx";
import type { PromptView, RankResults, SealedResults } from "@/modules/reveal/engine";
import { REVEAL_TYPE_META } from "@/modules/reveal/schema";

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function PromptCard({ prompt, memberNames }: { prompt: PromptView; memberNames: string[] }) {
  const router = useRouter();
  const meta = REVEAL_TYPE_META[prompt.type];
  const [busy, setBusy] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const { stamp, fire, cardFxClass } = useActionStamp();
  const [armedLock, setArmedLock] = useState(false);

  // Rank ballot: tap to move items from pool → your order.
  const [ranked, setRanked] = useState<number[]>([]);

  const items = prompt.items ?? [];

  async function voteUnlock() {
    setBusy(true);
    try {
      await api(`/api/reveal/${prompt.id}/unlock`, { method: "PUT" });
      fire(prompt.iVotedUnlock ? "VOTE WITHDRAWN" : "UNSEAL VOTE ✓", prompt.iVotedUnlock ? "ink" : "yellow");
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const pool = items.map((_, i) => i).filter((i) => !ranked.includes(i));
  const memberSet = new Set(memberNames);

  async function lockIn() {
    if (!armedLock) {
      setArmedLock(true);
      setTimeout(() => setArmedLock(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/reveal/${prompt.id}/submit`, {
        method: "POST",
        body: { order: ranked },
      });
      fire("LOCKED IN ✓", "green");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't lock that in.");
    } finally {
      setBusy(false);
      setArmedLock(false);
    }
  }

  async function remove() {
    if (!armedDelete) {
      setArmedDelete(true);
      setTimeout(() => setArmedDelete(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/reveal/${prompt.id}`, { method: "DELETE" });
      fire("DELETED", "red", { leave: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  const ready = ranked.length === items.length && items.length > 0;

  return (
    <li id={`prompt-${prompt.id}`} className={`brutal-card relative scroll-mt-24 p-4 ${cardFxClass}`}>
      <StampOverlay stamp={stamp} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="inline-flex items-center gap-1.5 bg-ink text-white">
          <PixelIcon name={meta.icon} size={13} /> {meta.label}
        </Badge>
        {prompt.status === "open" && prompt.type !== "sealed" && (
          <Badge className="bg-paper">
            {prompt.submittedCount}/{prompt.memberCount} in
          </Badge>
        )}
        {prompt.status === "open" && prompt.type === "sealed" && prompt.unlockAt && (
          <Badge className="inline-flex items-center gap-1.5 bg-accent-yellow">
            <PixelIcon name="lock" size={13} /> opens in {daysUntil(prompt.unlockAt)}d
          </Badge>
        )}
        {prompt.status === "open" && prompt.deadline && (
          <Badge className="inline-flex items-center gap-1.5 bg-paper">
            <PixelIcon name="clock" size={13} /> {daysUntil(prompt.deadline)}d left
          </Badge>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase text-ink/40">
          by {prompt.creatorName}
        </span>
      </div>

      <p className="mt-2 font-display text-lg font-bold leading-tight">{prompt.title}</p>

      {/* ---------- OPEN: blind submission ---------- */}
      {prompt.status === "open" && prompt.type !== "sealed" && !prompt.iSubmitted && (
        <div className="mt-3 space-y-2">
          {ranked.length > 0 && (
                <ol className="space-y-1">
                  {ranked.map((idx, pos) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => setRanked(ranked.filter((r) => r !== idx))}
                        className="brutal-press w-full border-2 border-ink bg-accent-yellow px-3 py-1.5 text-left text-sm font-bold shadow-brutal-sm"
                      >
                        {pos + 1}. {items[idx]} <span className="text-ink/40">(tap to undo)</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {pool.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pool.map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setRanked([...ranked, idx])}
                      className="brutal-press border-2 border-ink bg-card px-2.5 py-1 text-sm font-bold shadow-brutal-sm"
                    >
                      {items[idx]}
                    </button>
                  ))}
                </div>
              )}
          <p className="font-mono text-[10px] uppercase text-ink/40">
            Tap in order, best first
          </p>
          <Button onClick={lockIn} disabled={busy || !ready} className="w-full" variant={armedLock ? "danger" : "primary"}>
            {busy ? (
              "…"
            ) : armedLock ? (
              "Sure? NO take-backs"
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <PixelIcon name="lock" size={14} /> Lock it in
              </span>
            )}
          </Button>
        </div>
      )}

      {prompt.status === "open" && prompt.type !== "sealed" && prompt.iSubmitted && (
        <p className="mt-3 border-2 border-dashed border-ink/30 bg-paper px-3 py-2 font-mono text-xs text-ink/60">
          <PixelIcon name="lock" size={13} className="-mt-0.5 mr-1 inline" />
          You&apos;re locked in. Waiting on{" "}
          {Math.max(0, prompt.memberCount - prompt.submittedCount)} more…
        </p>
      )}

      {prompt.status === "open" && prompt.type === "sealed" && (
        <div className="mt-3 border-2 border-dashed border-ink/30 bg-paper px-3 py-2">
          <p className="font-mono text-xs text-ink/60">
            <PixelIcon name="mail" size={13} className="-mt-0.5 mr-1 inline" />
            Sealed. Nobody can read it — not even {prompt.isMine ? "you" : prompt.creatorName}.
          </p>
          {prompt.unlockVotesNeeded !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="h-3.5 w-28 border-2 border-ink bg-card">
                <div
                  className="h-full bg-accent-yellow"
                  style={{
                    width: `${Math.min(100, Math.round((prompt.unlockVoteCount / prompt.unlockVotesNeeded) * 100))}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] font-bold uppercase text-ink/60">
                {prompt.unlockVoteCount}/{prompt.unlockVotesNeeded} to unseal early
              </span>
              <button
                onClick={voteUnlock}
                disabled={busy}
                className={`brutal-press ml-auto border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm ${
                  prompt.iVotedUnlock ? "bg-ink text-white" : "bg-accent-yellow"
                }`}
              >
                {prompt.iVotedUnlock ? "Withdraw vote" : "Vote to unseal"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- REVEALED: aggregates only ---------- */}
      {prompt.results?.kind === "rank" && (
        <RankReveal results={prompt.results} memberSet={memberSet} />
      )}
      {prompt.results?.kind === "sealed" && <SealedReveal results={prompt.results} />}

      {(prompt.isMine || prompt.isAdmin) && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={remove}
            disabled={busy}
            className={`brutal-press border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
              armedDelete ? "bg-accent-red text-white" : "bg-card"
            }`}
          >
            {armedDelete ? "Sure?" : "✕"}
          </button>
        </div>
      )}
    </li>
  );
}

function RankReveal({ results, memberSet }: { results: RankResults; memberSet: Set<string> }) {
  return (
    <div className="mt-3 space-y-1.5 animate-pop-in">
      {results.consensus.map((entry, pos) => (
        <div
          key={entry.label}
          className={`flex items-center gap-2 border-2 border-ink px-3 py-1.5 ${
            pos === 0 ? "bg-accent-yellow" : "bg-card"
          }`}
        >
          <span className="font-display text-lg font-bold">{pos + 1}.</span>
          {memberSet.has(entry.label) && <Avatar name={entry.label} size="sm" />}
          <span className="font-bold">{entry.label}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {results.mostOff && (
          <Badge className="inline-flex items-center gap-1.5 bg-accent-red text-white">
            <PixelIcon name="target" size={13} /> Most off: {results.mostOff.name} (Δ{results.mostOff.delta})
          </Badge>
        )}
        {results.myDelta !== null && (
          <Badge className="bg-paper">You: Δ{results.myDelta}</Badge>
        )}
      </div>
    </div>
  );
}

function SealedReveal({ results }: { results: SealedResults }) {
  return (
    <div className="mt-3 animate-pop-in border-2 border-ink bg-paper p-3">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{results.body}</p>
    </div>
  );
}
