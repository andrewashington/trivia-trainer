"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge, UserLink } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { CommentThread } from "@/modules/comments/CommentThread";

type Verdict = "smash" | "pass";

type VoteView = {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  verdict: Verdict;
};

type CardView = {
  id: string;
  label: string;
  imageUrl: string | null;
  votes: VoteView[];
};

export type DeckView = {
  id: string;
  title: string;
  detail: string | null;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  cards: CardView[];
};

const TALLY_FLASH_MS = 1400;

function VoterRow({ votes, verdict }: { votes: VoteView[]; verdict: Verdict }) {
  const side = votes.filter((v) => v.verdict === verdict);
  if (side.length === 0) return <span className="font-mono text-[10px] text-ink/30">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {side.map((v) => (
        <Avatar key={v.userId} name={v.userName} src={v.avatarUrl} size="sm" title={`${v.userName} — ${verdict.toUpperCase()}`} />
      ))}
    </span>
  );
}

function CardFace({ card, size }: { card: CardView; size: "lg" | "sm" }) {
  if (card.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={card.imageUrl}
        alt={card.label}
        className={
          size === "lg"
            ? "h-64 w-full border-b-3 border-ink object-cover sm:h-80"
            : "h-10 w-10 shrink-0 border-2 border-ink object-cover"
        }
      />
    );
  }
  if (size === "sm") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink bg-accent-smooch font-display text-lg font-bold text-white">
        {card.label.charAt(0).toUpperCase() || "🔥"}
      </span>
    );
  }
  return (
    <div className="flex h-64 w-full items-center justify-center border-b-3 border-ink bg-accent-smooch sm:h-80">
      <span className="font-display text-8xl font-bold text-white">
        {card.label.charAt(0).toUpperCase() || "🔥"}
      </span>
    </div>
  );
}

export function SmashGame({
  deck,
  viewerId,
  viewerName,
  viewerAvatarUrl,
  viewerIsAdmin,
  canDelete,
  commentCount,
}: {
  deck: DeckView;
  viewerId: string;
  viewerName: string;
  viewerAvatarUrl: string | null;
  viewerIsAdmin: boolean;
  canDelete: boolean;
  commentCount: number;
}) {
  // Votes live in client state so judging + verdict changes feel instant.
  const [votesByCard, setVotesByCard] = useState<Record<string, VoteView[]>>(() =>
    Object.fromEntries(deck.cards.map((c) => [c.id, c.votes]))
  );
  const [showResults, setShowResults] = useState(false);
  const [flash, setFlash] = useState<string | null>(null); // card id whose tally is flashing
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myVerdict = useCallback(
    (cardId: string): Verdict | null =>
      votesByCard[cardId]?.find((v) => v.userId === viewerId)?.verdict ?? null,
    [votesByCard, viewerId]
  );

  const unvoted = deck.cards.filter((c) => !myVerdict(c.id));
  const current = unvoted[0] ?? null;
  const judged = deck.cards.length - unvoted.length;
  const allDone = unvoted.length === 0;

  const castVote = useCallback(
    async (cardId: string, verdict: Verdict, withFlash: boolean) => {
      // Optimistic: replace my vote locally first.
      setVotesByCard((prev) => ({
        ...prev,
        [cardId]: [
          ...(prev[cardId] ?? []).filter((v) => v.userId !== viewerId),
          { userId: viewerId, userName: viewerName, avatarUrl: viewerAvatarUrl, verdict },
        ],
      }));
      if (withFlash) {
        setFlash(cardId);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), TALLY_FLASH_MS);
      }
      try {
        await api(`/api/smash/cards/${cardId}/vote`, { method: "PUT", body: { verdict } });
      } catch (err) {
        // Roll back my optimistic vote on failure.
        setVotesByCard((prev) => ({
          ...prev,
          [cardId]: (prev[cardId] ?? []).filter((v) => v.userId !== viewerId),
        }));
        setFlash(null);
        alert(err instanceof Error ? err.message : "Vote failed.");
      }
    },
    [viewerId, viewerName, viewerAvatarUrl]
  );

  // Keyboard: → smash, ← pass (only while judging the live card).
  useEffect(() => {
    if (showResults || !current || flash) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") castVote(current.id, "smash", true);
      if (e.key === "ArrowLeft") castVote(current.id, "pass", true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showResults, current, flash, castVote]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  // Ranking for the results board: smash% desc, then total votes desc.
  const ranked = useMemo(() => {
    return deck.cards
      .map((c) => {
        const votes = votesByCard[c.id] ?? [];
        const smash = votes.filter((v) => v.verdict === "smash").length;
        const pass = votes.length - smash;
        const pct = votes.length === 0 ? 0 : Math.round((smash / votes.length) * 100);
        return { card: c, votes, smash, pass, pct };
      })
      .sort((a, b) => (b.pct !== a.pct ? b.pct - a.pct : b.votes.length - a.votes.length));
  }, [deck.cards, votesByCard]);

  const flashCard = flash ? deck.cards.find((c) => c.id === flash) ?? null : null;
  const flashVotes = flashCard ? votesByCard[flashCard.id] ?? [] : [];
  const inResults = showResults || allDone;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/smash" className="brutal-press border-2 border-ink bg-card px-2 py-1 font-mono text-[10px] font-bold uppercase no-underline shadow-brutal-sm">
              ← Decks
            </Link>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{deck.title}</h1>
          </div>
          {deck.detail && <p className="mt-1 text-sm text-ink/70">{deck.detail}</p>}
          <span className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/40">
            dealt by{" "}
            <UserLink userId={deck.creatorId} name={deck.creatorName} avatarUrl={deck.creatorAvatarUrl} size="sm" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!allDone && (
            <button
              onClick={() => setShowResults((s) => !s)}
              className="brutal-press border-2 border-ink bg-card px-2 py-1 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
            >
              {showResults ? "← Back to judging" : "Peek at results"}
            </button>
          )}
          {canDelete && (
            <DeleteButton endpoint={`/api/smash/${deck.id}`} redirectTo="/smash" label="✕ Deck" />
          )}
        </div>
      </div>

      {!inResults && current ? (
        /* ============ Judging phase ============ */
        <div className="mx-auto max-w-md space-y-4">
          {/* Progress */}
          <div>
            <p className="mb-1 font-mono text-[10px] font-bold uppercase text-ink/50">
              card {judged + 1} of {deck.cards.length}
            </p>
            <div className="h-3 border-2 border-ink bg-card">
              <div
                className="h-full bg-accent-smooch transition-all"
                style={{ width: `${(judged / deck.cards.length) * 100}%` }}
              />
            </div>
          </div>

          {flashCard ? (
            /* Tally flash for the card just judged */
            <div className="brutal-card overflow-hidden">
              <CardFace card={flashCard} size="lg" />
              <div className="space-y-3 p-4">
                <p className="text-center font-display text-2xl font-bold">{flashCard.label}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border-2 border-ink bg-accent-smooch p-2 text-white">
                    <p className="font-display text-xl font-bold">
                      💋 {flashVotes.filter((v) => v.verdict === "smash").length}
                    </p>
                    <VoterRow votes={flashVotes} verdict="smash" />
                  </div>
                  <div className="border-2 border-ink bg-card p-2">
                    <p className="font-display text-xl font-bold">
                      🚫 {flashVotes.filter((v) => v.verdict === "pass").length}
                    </p>
                    <VoterRow votes={flashVotes} verdict="pass" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="brutal-card overflow-hidden">
              <CardFace card={current} size="lg" />
              <p className="p-4 text-center font-display text-3xl font-bold leading-tight">
                {current.label}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => current && !flash && castVote(current.id, "pass", true)}
              disabled={!!flash}
              className="brutal-press border-3 border-ink bg-card py-4 font-display text-xl font-bold uppercase shadow-brutal disabled:opacity-50"
            >
              🚫 Pass
            </button>
            <button
              onClick={() => current && !flash && castVote(current.id, "smash", true)}
              disabled={!!flash}
              className="brutal-press border-3 border-ink bg-accent-smooch py-4 font-display text-xl font-bold uppercase text-white shadow-brutal disabled:opacity-50"
            >
              💋 Smash
            </button>
          </div>
          <p className="text-center font-mono text-[10px] uppercase text-ink/40">
            ← pass · smash →
          </p>
        </div>
      ) : (
        /* ============ Results board ============ */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold uppercase">The verdicts</h2>
            {allDone && <Badge className="bg-accent-smooch text-white">VERDICTS IN ✓</Badge>}
          </div>
          <ul className="space-y-3">
            {ranked.map(({ card, votes, smash, pass, pct }, i) => {
              const mine = myVerdict(card.id);
              const total = votes.length;
              return (
                <li key={card.id} className="brutal-card p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-center font-display text-xl font-bold">
                      {i === 0 && total > 0 ? "👑" : `#${i + 1}`}
                    </span>
                    <CardFace card={card} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-bold">
                        {card.label}
                        {i === 0 && total > 0 && (
                          <span className="ml-2 font-mono text-[10px] uppercase text-accent-smooch">
                            most smashable
                          </span>
                        )}
                      </p>
                      {/* Split bar */}
                      <div className="mt-1 flex h-3 border-2 border-ink bg-card">
                        <div className="h-full bg-accent-smooch" style={{ width: `${total ? (smash / total) * 100 : 0}%` }} />
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] uppercase text-ink/50">
                        {total === 0 ? "no votes yet" : `${pct}% smash · ${smash} smash / ${pass} pass`}
                      </p>
                    </div>
                    {/* Change your verdict */}
                    <span className="flex shrink-0 gap-1">
                      <button
                        onClick={() => castVote(card.id, "smash", false)}
                        title="Smash"
                        className={`brutal-press border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
                          mine === "smash" ? "bg-accent-smooch text-white" : "bg-card"
                        }`}
                      >
                        💋
                      </button>
                      <button
                        onClick={() => castVote(card.id, "pass", false)}
                        title="Pass"
                        className={`brutal-press border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
                          mine === "pass" ? "bg-ink text-white" : "bg-card"
                        }`}
                      >
                        🚫
                      </button>
                    </span>
                  </div>
                  <div className="mt-2 flex items-start gap-4 pl-[52px]">
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-[10px] uppercase text-ink/40">💋</span>
                      <VoterRow votes={votes} verdict="smash" />
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-[10px] uppercase text-ink/40">🚫</span>
                      <VoterRow votes={votes} verdict="pass" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="brutal-card p-4">
        <CommentThread
          targetType="smashdeck"
          targetId={deck.id}
          initialCount={commentCount}
          viewerId={viewerId}
          viewerIsAdmin={viewerIsAdmin}
        />
      </div>
    </div>
  );
}
