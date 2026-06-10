"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Avatar, Badge } from "@/components/ui";

export type GalleryPhoto = {
  id: string;
  caption: string | null;
  createdAt: string;
  viewUrl: string;
  uploader: { id: string; displayName: string; avatarUrl: string | null };
  tagged: { id: string; displayName: string; avatarUrl: string | null }[];
  canDelete: boolean;
};

export function PhotoGrid({ photos }: { photos: GalleryPhoto[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = photos.find((p) => p.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => setArmed(false), [openId]);

  async function remove(photo: GalleryPhoto) {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/photobook/${photo.id}`, { method: "DELETE" });
      setOpenId(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpenId(p.id)}
              className="brutal-press block w-full border-2 border-ink bg-card shadow-brutal"
              title={p.caption ?? "Open photo"}
            >
              <span className="block aspect-square overflow-hidden border-b-2 border-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.viewUrl}
                  alt={p.caption ?? "Group photo"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="flex items-center gap-1.5 px-2 py-1.5 text-left">
                <Avatar name={p.uploader.displayName} src={p.uploader.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold text-ink/60">
                  {p.caption ?? new Date(p.createdAt).toLocaleDateString()}
                </span>
                {p.tagged.length > 0 && (
                  <span className="shrink-0 font-mono text-[11px] font-bold text-ink/50">
                    {p.tagged.length}&nbsp;tagged
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-ink/70 p-4 pt-10 sm:pt-16"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenId(null);
          }}
        >
          <div className="brutal-card w-full max-w-3xl animate-pop-in bg-card">
            <div className="flex items-center justify-between gap-2 border-b-2 border-ink px-3 py-2">
              <Link
                href={`/people/${open.uploader.id}`}
                className="inline-flex min-w-0 items-center gap-2 no-underline"
              >
                <Avatar name={open.uploader.displayName} src={open.uploader.avatarUrl} size="sm" />
                <span className="truncate font-display font-bold">
                  {open.uploader.displayName}
                </span>
                <span className="shrink-0 font-mono text-xs text-ink/50">
                  {new Date(open.createdAt).toLocaleDateString()}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {open.canDelete && (
                  <button
                    onClick={() => remove(open)}
                    disabled={busy}
                    className={`brutal-press border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold shadow-brutal-sm ${
                      armed ? "bg-accent-red text-white" : "bg-card"
                    }`}
                  >
                    {armed ? "Sure?" : "Delete"}
                  </button>
                )}
                <button
                  onClick={() => setOpenId(null)}
                  className="brutal-press border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold shadow-brutal-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.viewUrl}
              alt={open.caption ?? "Group photo"}
              className="max-h-[70vh] w-full bg-ink object-contain"
            />
            <div className="space-y-2 border-t-2 border-ink px-3 py-2">
              {open.caption && <p className="font-bold leading-snug">{open.caption}</p>}
              {open.tagged.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-bold uppercase text-ink/50">
                    In the shot:
                  </span>
                  {open.tagged.map((t) => (
                    <Link key={t.id} href={`/people/${t.id}`} className="no-underline">
                      <Badge className="bg-accent-coral text-white">{t.displayName}</Badge>
                    </Link>
                  ))}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
