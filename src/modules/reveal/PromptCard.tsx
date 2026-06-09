"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge, Button } from "@/components/ui";
import type { PromptView, RankResults, OracleResults, SealedResults } from "@/modules/reveal/engine";
import { REVEAL_TYPE_META } from "@/modules/reveal/schema";

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function PromptCard({ prompt, memberNames }: { prompt: PromptView; memberNames: string[] }) {
  const router = useRouter();
  const meta = REVEAL_TYPE_META[prompt.type];
  const [busy, setBusy] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [armedLock, setArmedLock] = useState(false);

  // Rank ballot: tap to move items from pool → your order.
  const [ranked, setRanked] = useState<number[]>([]);
  // Oracle ballot
  const [value, setValue] = useState<number | null>(null);

  const items = prompt.items ?? [];
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
        body: prompt.type === "rank" ? { order: ranked } : { value },
      });
      router.refresh();
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
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  const ready =
    prompt.type === "rank" ? ranked.length === items.length && items.length > 0 : value !== null;

  return (
    <li className={`brutal-card p-4 ${prompt.status === "revealed" ? "" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="bg-ink text-white">{meta.icon} {meta.label}</Badge>
        {prompt.status === "open" && prompt.type !== "sealed" && (
          <Badge className="bg-paper">
            {prompt.submittedCount}/{prompt.memberCount} in
          </Badge>
        )}
        {prompt.status === "open" && prompt.type === "sealed" && prompt.unlockAt && (
          <Badge className="bg-accent-yellow">🔒 opens in {daysUntil(prompt.unlockAt)}d</Badge>
        )}
        {prompt.status === "open" && prompt.deadline && (
          <Badge className="bg-paper">⏳ {daysUntil(prompt.deadline)}d left</Badge>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase text-ink/40">
          by {prompt.creatorName}
        </span>
      </div>

      <p className="mt-2 font-display text-lg font-bold leading-tight">{prompt.title}</p>

      {/* ---------- OPEN: blind submission ---------- */}
      {prompt.status === "open" && prompt.type !== "sealed" && !prompt.iSubmitted && (
        <div className="mt-3 space-y-2">
          {prompt.type === "rank" ? (
            <>
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
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: prompt.scaleMax ?? 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setValue(n)}
                  className={`brutal-press min-w-9 border-2 border-ink py-1.5 font-display font-bold shadow-brutal-sm ${
                    value === n ? "bg-ink text-white" : "bg-card"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <Button onClick={lockIn} disabled={busy || !ready} className="w-full" variant={armedLock ? "danger" : "primary"}>
            {busy ? "…" : armedLock ? "Sure? NO take-backs" : "🔒 Lock it in"}
          </Button>
        </div>
      )}

      {prompt.status === "open" && prompt.type !== "sealed" && prompt.iSubmitted && (
        <p className="mt-3 border-2 border-dashed border-ink/30 bg-paper px-3 py-2 font-mono text-xs text-ink/60">
          🔒 You&apos;re locked in. Waiting on{" "}
          {Math.max(0, prompt.memberCount - prompt.submittedCount)} more…
        </p>
      )}

      {prompt.status === "open" && prompt.type === "sealed" && (
        <p className="mt-3 border-2 border-dashed border-ink/30 bg-paper px-3 py-2 font-mono text-xs text-ink/60">
          ✉️ Sealed. Nobody can read it — not even {prompt.isMine ? "you" : prompt.creatorName}.
        </p>
      )}

      {/* ---------- REVEALED: aggregates only ---------- */}
      {prompt.results?.kind === "rank" && (
        <RankReveal results={prompt.results} memberSet={memberSet} />
      )}
      {prompt.results?.kind === "oracle" && <OracleReveal results={prompt.results} />}
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
          <Badge className="bg-accent-red text-white">
            🎯 Most off: {results.mostOff.name} (Δ{results.mostOff.delta})
          </Badge>
        )}
        {results.myDelta !== null && (
          <Badge className="bg-paper">You: Δ{results.myDelta}</Badge>
        )}
      </div>
    </div>
  );
}

function OracleReveal({ results }: { results: OracleResults }) {
  return (
    <div className="mt-3 animate-pop-in">
      <p className="font-display text-4xl font-bold">
        {results.average}
        <span className="text-base text-ink/50"> group blend · median {results.median}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge className="bg-paper">{results.count} answers</Badge>
        {results.myValue !== null && (
          <Badge className="bg-accent-yellow">
            You said {results.myValue} — {results.myDistance} off the blend
          </Badge>
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
