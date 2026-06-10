"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge } from "@/components/ui";
import { StampOverlay, useActionStamp } from "@/components/ActionFx";
import { STATUS_META } from "@/modules/ideas/schema";
import { CommentThread } from "@/modules/comments/CommentThread";

export type IdeaView = {
  id: string;
  title: string;
  detail: string | null;
  status: "open" | "planned" | "done";
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  voteCount: number;
  myVote: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  viewerId: string;
  commentCount: number;
};

export function IdeaCard({ idea }: { idea: IdeaView }) {
  const router = useRouter();
  const [count, setCount] = useState(idea.voteCount);
  const [mine, setMine] = useState(idea.myVote);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { stamp, fire, cardFxClass } = useActionStamp();

  async function toggleVote() {
    // Optimistic: flip immediately, reconcile with the server's count.
    const next = !mine;
    setMine(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      const res = await api<{ voteCount: number; myVote: boolean }>(
        `/api/ideas/${idea.id}/vote`,
        { method: "PUT", body: { voted: next } }
      );
      setCount(res.voteCount);
      setMine(res.myVote);
    } catch (err) {
      setMine(!next);
      setCount((c) => c + (next ? -1 : 1));
      alert(err instanceof Error ? err.message : "Vote failed.");
    }
  }

  async function setStatus(status: "open" | "planned" | "done") {
    try {
      await api(`/api/ideas/${idea.id}`, { method: "PATCH", body: { status } });
      fire(
        status === "planned" ? "PLANNED ✓" : status === "done" ? "SHIPPED ✓" : "REOPENED",
        status === "done" ? "green" : status === "planned" ? "yellow" : "ink",
        { leave: true }
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Status change failed.");
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
      await api(`/api/ideas/${idea.id}`, { method: "DELETE" });
      fire("DELETED", "red", { leave: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  const meta = STATUS_META[idea.status];

  return (
    <li id={`idea-${idea.id}`} className={`brutal-card flex scroll-mt-24 gap-3 p-4 ${idea.status === "done" ? "opacity-70" : ""} relative ${cardFxClass}`}>
      <StampOverlay stamp={stamp} />
      <button
        onClick={toggleVote}
        aria-pressed={mine}
        title={mine ? "Remove your vote" : "Upvote"}
        className={`brutal-press flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-3 border-ink font-display font-bold shadow-brutal ${
          mine ? "bg-accent-lime" : "bg-card"
        }`}
      >
        <span className="text-lg leading-none">▲</span>
        <span className="text-lg leading-none">{count}</span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg font-bold leading-tight">{idea.title}</p>
          {idea.status !== "open" && <Badge className={meta.badge}>{meta.label}</Badge>}
        </div>
        {idea.detail && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{idea.detail}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/40">
            by{" "}
            <Link
              href={`/people/${idea.authorId}`}
              className="inline-flex items-center gap-1 text-ink/40 no-underline hover:text-accent-blue"
            >
              <Avatar name={idea.authorName} src={idea.authorAvatarUrl} size="sm" /> {idea.authorName}
            </Link>
          </span>
          {idea.isAdmin && (
            <span className="ml-auto flex gap-1">
              {(["open", "planned", "done"] as const)
                .filter((s) => s !== idea.status)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className="brutal-press border-2 border-ink bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm"
                  >
                    → {STATUS_META[s].label}
                  </button>
                ))}
            </span>
          )}
          {idea.canDelete && (
            <button
              onClick={remove}
              disabled={busy}
              className={`brutal-press border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
                armed ? "bg-accent-red text-white" : "bg-card"
              } ${idea.isAdmin ? "" : "ml-auto"}`}
            >
              {armed ? "Sure?" : "✕"}
            </button>
          )}
        </div>
        <CommentThread
          targetType="idea"
          targetId={idea.id}
          initialCount={idea.commentCount}
          viewerId={idea.viewerId}
          viewerIsAdmin={idea.isAdmin}
        />
      </div>
    </li>
  );
}
