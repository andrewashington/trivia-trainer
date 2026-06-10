"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui";
import type { CommentTargetType } from "@/modules/comments/schema";

type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * One collapsible comment thread for any (targetType, targetId) surface.
 * Renders a toggle with the count; loads the thread lazily on first open.
 */
export function CommentThread({
  targetType,
  targetId,
  initialCount,
  viewerId,
  viewerIsAdmin = false,
}: {
  targetType: CommentTargetType;
  targetId: string;
  initialCount: number;
  viewerId: string;
  viewerIsAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [count, setCount] = useState(initialCount);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    api<{ comments: CommentView[] }>(
      `/api/comments?targetType=${targetType}&targetId=${targetId}`
    )
      .then((res) => {
        setComments(res.comments);
        setCount(res.comments.length);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded, targetType, targetId]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await api<{ comment: CommentView }>("/api/comments", {
        method: "POST",
        body: { targetType, targetId, body },
      });
      setComments((c) => [...c, res.comment]);
      setCount((c) => c + 1);
      setDraft("");
      inputRef.current?.focus();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Comment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/comments/${id}`, { method: "DELETE" });
      setComments((c) => c.filter((x) => x.id !== id));
      setCount((c) => Math.max(0, c - 1));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="mt-3 border-t-2 border-dashed border-ink/20 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="brutal-press inline-flex items-center gap-1.5 border-2 border-ink bg-card px-2 py-0.5 font-mono text-[11px] font-bold uppercase shadow-brutal-sm"
        aria-expanded={open}
      >
        💬 {count === 0 ? "Comment" : `${count} comment${count === 1 ? "" : "s"}`}
        <span className="text-ink/50">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!loaded && <p className="font-mono text-xs text-ink/50">Loading…</p>}
          {loaded && comments.length === 0 && (
            <p className="font-mono text-xs text-ink/50">Nothing yet. Say the thing.</p>
          )}
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <Link href={`/people/${c.authorId}`} className="shrink-0 no-underline">
                  <Avatar name={c.authorName} src={c.authorAvatarUrl} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase text-ink/40">
                    {c.authorName} · {timeAgo(c.createdAt)}
                    {(viewerIsAdmin || c.authorId === viewerId) && (
                      <button
                        onClick={() => remove(c.id)}
                        title="Delete comment"
                        className="ml-2 text-ink/30 hover:text-accent-red"
                      >
                        ✕
                      </button>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-snug">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Add a comment…"
              className="min-h-[38px] flex-1 resize-y border-2 border-ink bg-card px-2 py-1.5 text-sm shadow-brutal-sm focus:outline-none"
            />
            <button
              onClick={submit}
              disabled={busy || !draft.trim()}
              className="brutal-press border-2 border-ink bg-accent-yellow px-3 py-1.5 font-display text-sm font-bold uppercase shadow-brutal-sm disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
