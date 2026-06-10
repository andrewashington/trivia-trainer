"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge } from "@/components/ui";
import { PixelIcon } from "@/components/icons";

export type EntryView = {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  text: string | null;
  photoUrl: string | null;
  createdAt: string;
  voteCount: number;
  isMine: boolean;
  isWinner: boolean;
};

export function EntryCard({
  entry,
  challengeId,
  open,
  myVote,
}: {
  entry: EntryView;
  challengeId: string;
  open: boolean;
  /** entryId the viewer currently votes for (null = no vote yet). */
  myVote: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const voted = myVote === entry.id;

  async function toggleVote() {
    setBusy(true);
    try {
      await api(`/api/challenges/${challengeId}/vote`, {
        method: "PUT",
        body: { entryId: voted ? null : entry.id },
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Vote failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`brutal-card relative flex gap-3 p-4 ${
        entry.isWinner ? "border-3 bg-accent-yellow/30" : ""
      }`}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        {open && !entry.isMine ? (
          <button
            onClick={toggleVote}
            disabled={busy}
            aria-pressed={voted}
            title={voted ? "Remove your vote" : "Vote for this entry"}
            className={`brutal-press flex h-16 w-14 flex-col items-center justify-center gap-0.5 border-3 border-ink font-display font-bold shadow-brutal ${
              voted ? "bg-accent-rust text-white" : "bg-card"
            }`}
          >
            <span className="text-lg leading-none">▲</span>
            <span className="text-lg leading-none">{entry.voteCount}</span>
          </button>
        ) : (
          <div className="flex h-16 w-14 flex-col items-center justify-center gap-0.5 border-3 border-ink bg-paper font-display font-bold shadow-brutal">
            <span className="text-lg leading-none">▲</span>
            <span className="text-lg leading-none">{entry.voteCount}</span>
          </div>
        )}
        {open && entry.isMine && (
          <span className="font-mono text-[9px] uppercase text-ink/40">yours</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/people/${entry.userId}`}
            className="inline-flex items-center gap-1.5 font-display text-sm font-bold no-underline hover:text-accent-rust"
          >
            <Avatar name={entry.userName} src={entry.userAvatarUrl} size="sm" />
            {entry.userName}
          </Link>
          {entry.isWinner && (
            <Badge className="bg-accent-yellow">
              <span className="inline-flex items-center gap-1">
                <PixelIcon name="trophy" size={12} /> Winner +25
              </span>
            </Badge>
          )}
        </div>
        {entry.text && (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/80">{entry.text}</p>
        )}
        {entry.photoUrl && (
          <a href={entry.photoUrl} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.photoUrl}
              alt={`${entry.userName}'s proof`}
              className="mt-2 max-h-80 border-2 border-ink object-contain shadow-brutal-sm"
            />
          </a>
        )}
        <p className="mt-2 font-mono text-[10px] uppercase text-ink/40">
          {new Date(entry.createdAt).toLocaleString()}
        </p>
      </div>
    </li>
  );
}
