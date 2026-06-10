"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge, Button } from "@/components/ui";
import { StampOverlay, useActionStamp } from "@/components/ActionFx";
import type { PollResults } from "@/modules/polls/results";
import { POLL_TYPE_META } from "@/modules/polls/schema";
import { PixelIcon } from "@/components/icons";

export function PollCard({ poll }: { poll: PollResults }) {
  const router = useRouter();
  // Show the ballot if you haven't voted; results otherwise (or closed).
  const [revoting, setRevoting] = useState(false);
  const [picked, setPicked] = useState<string[]>(poll.myOptionIds);
  const [rating, setRating] = useState<number | null>(poll.myRating);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const { stamp, fire, cardFxClass } = useActionStamp();

  const showBallot = !poll.closed && (!poll.hasVoted || revoting);
  const showResults = !showBallot && !poll.resultsHidden;
  const showSealed = !showBallot && poll.resultsHidden;

  function togglePick(id: string) {
    if (poll.type === "single") {
      setPicked([id]);
    } else {
      setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
    }
  }

  async function castVote() {
    setBusy(true);
    try {
      await api(`/api/polls/${poll.id}/vote`, {
        method: "PUT",
        body: poll.type === "scale" ? { rating } : { optionIds: picked },
      });
      setRevoting(false);
      fire("VOTED ✓", "green");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Vote failed.");
    } finally {
      setBusy(false);
    }
  }

  async function voteReveal() {
    setBusy(true);
    try {
      await api(`/api/polls/${poll.id}/reveal`, { method: "PUT" });
      fire(poll.iVotedReveal ? "VOTE WITHDRAWN" : "REVEAL VOTE ✓", poll.iVotedReveal ? "ink" : "yellow");
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function setClosed(closed: boolean) {
    setBusy(true);
    try {
      await api(`/api/polls/${poll.id}`, { method: "PATCH", body: { closed } });
      fire(closed ? "CLOSED" : "REOPENED", closed ? "ink" : "green", { leave: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/polls/${poll.id}`, { method: "DELETE" });
      fire("DELETED", "red", { leave: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  const totalChoiceVotes = poll.options.reduce((a, o) => a + o.count, 0);
  const maxScaleCount = Math.max(1, ...(poll.scale?.distribution ?? [1]));

  return (
    <li id={`poll-${poll.id}`} className={`brutal-card relative scroll-mt-24 p-4 ${poll.closed ? "opacity-75" : ""} ${cardFxClass}`}>
      <StampOverlay stamp={stamp} />
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-lg font-bold leading-tight">{poll.question}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge className="inline-flex items-center gap-1.5 bg-paper">
          <PixelIcon name={POLL_TYPE_META[poll.type].icon} size={13} /> {POLL_TYPE_META[poll.type].label}
        </Badge>
        <Badge
          className={`inline-flex items-center gap-1.5 ${poll.anonymous ? "bg-ink text-white" : "bg-paper"}`}
        >
          <PixelIcon name={poll.anonymous ? "sunglasses" : "eye"} size={13} />
          {poll.anonymous ? "Anonymous" : "Named"}
        </Badge>
        {poll.resultsHidden && (
          <Badge className="inline-flex items-center gap-1.5 bg-accent-yellow">
            <PixelIcon name="lock" size={13} /> Blind voting
          </Badge>
        )}
        {poll.closed && <Badge className="bg-accent-red text-white">CLOSED</Badge>}
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/40">
          by <Avatar name={poll.creatorName} src={poll.creatorAvatarUrl} size="sm" /> {poll.creatorName} · {poll.voterCount} voted
        </span>
      </div>

      {/* ---- Ballot ---- */}
      {showBallot && (
        <div className="mt-3 space-y-2">
          {poll.type !== "scale" ? (
            poll.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => togglePick(opt.id)}
                className={`brutal-press block w-full border-2 border-ink px-3 py-2 text-left font-bold shadow-brutal-sm ${
                  picked.includes(opt.id) ? "bg-accent-indigo text-white" : "bg-card"
                }`}
              >
                {poll.type === "multi" ? (picked.includes(opt.id) ? "☑ " : "☐ ") : ""}
                {opt.label}
              </button>
            ))
          ) : (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`brutal-press flex-1 border-2 border-ink py-2 font-display text-lg font-bold shadow-brutal-sm ${
                    rating === n ? "bg-accent-indigo text-white" : "bg-card"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={castVote}
              disabled={busy || (poll.type === "scale" ? rating === null : picked.length === 0)}
              className="flex-1"
            >
              {busy ? "…" : poll.hasVoted ? "Change my vote" : "Vote"}
            </Button>
            {revoting && (
              <Button variant="ghost" onClick={() => setRevoting(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ---- Blind voting: results shown only by group vote ---- */}
      {showSealed && (
        <div className="mt-3 border-2 border-dashed border-ink bg-paper p-4 text-center">
          <PixelIcon name="lock" size={28} className="mx-auto text-ink/60" />
          <p className="mt-2 font-display font-bold">
            Results are blind — vote without anchoring.
          </p>
          <p className="mt-1 font-mono text-xs text-ink/60">
            {poll.revealVoteCount} / {poll.revealThreshold} votes to show them
          </p>
          <div className="mx-auto mt-2 h-4 max-w-[12rem] border-2 border-ink bg-card">
            <div
              className="h-full bg-accent-indigo"
              style={{
                width: `${Math.min(100, Math.round((poll.revealVoteCount / (poll.revealThreshold || 1)) * 100))}%`,
              }}
            />
          </div>
          <Button
            variant={poll.iVotedReveal ? "ghost" : "yellow"}
            onClick={voteReveal}
            disabled={busy}
            className="mt-3 !py-1.5 text-sm"
          >
            {poll.iVotedReveal ? "Withdraw my reveal vote" : "Vote to reveal"}
          </Button>
        </div>
      )}

      {/* ---- Results ---- */}
      {showResults && (
        <div className="mt-3 space-y-2">
          {poll.type !== "scale" ? (
            poll.options.map((opt) => {
              const pct = totalChoiceVotes > 0 ? Math.round((opt.count / totalChoiceVotes) * 100) : 0;
              const mine = poll.myOptionIds.includes(opt.id);
              return (
                <div key={opt.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">
                      {opt.label} {mine && "← you"}
                    </span>
                    <span className="font-mono text-xs text-ink/60">
                      {opt.count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-0.5 h-5 border-2 border-ink bg-card">
                    <div
                      className={`h-full ${mine ? "bg-accent-indigo" : "bg-accent-yellow"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {!poll.anonymous && opt.voters.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-ink/50">
                      {opt.voters.map((voter) => (
                        <span key={voter.name} className="inline-flex items-center gap-1">
                          <Avatar name={voter.name} src={voter.avatarUrl} size="sm" />
                          {voter.name}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <div>
              <p className="font-display text-3xl font-bold">
                {poll.scale?.average ?? "—"}
                <span className="text-base text-ink/50"> / 5 average</span>
              </p>
              <div className="mt-2 flex h-20 items-end gap-1.5">
                {poll.scale?.distribution.map((count, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                    <div
                      className={`w-full border-2 border-ink ${
                        poll.myRating === i + 1 ? "bg-accent-indigo" : "bg-accent-yellow"
                      }`}
                      style={{ height: `${Math.max(6, (count / maxScaleCount) * 64)}px` }}
                      title={`${count} vote${count === 1 ? "" : "s"}`}
                    />
                    <span className="font-mono text-[10px] font-bold">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {!poll.closed && poll.hasVoted && !revoting && (
          <button
            onClick={() => setRevoting(true)}
            className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
          >
            Change vote
          </button>
        )}
        {(poll.isMine || poll.isAdmin) && (
          <>
            <button
              onClick={() => setClosed(!poll.closed)}
              disabled={busy}
              className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
            >
              {poll.closed ? "↻ Reopen" : "Close poll"}
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className={`brutal-press border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
                armed ? "bg-accent-red text-white" : "bg-card"
              }`}
            >
              {armed ? "Sure?" : "✕"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
