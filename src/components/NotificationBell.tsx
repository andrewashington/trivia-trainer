"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelIcon } from "@/components/icons";

type NotifItem = {
  id: string;
  type: string;
  actorId: string | null;
  title: string;
  body: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [notifications, setNotifications] = useState<NotifItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotifItem[]; unread: number };
      setNotifications(data.notifications);
      setUnread(data.unread);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    // Fetch only when first opened or when re-opening
    if (nextOpen && notifications === null) {
      void fetchNotifications();
    } else if (nextOpen) {
      void fetchNotifications();
    }
  }

  async function handleItemClick(item: NotifItem) {
    setOpen(false);
    if (!item.readAt) {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      setNotifications((prev) =>
        prev
          ? prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n))
          : prev
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    router.push(item.href);
  }

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setNotifications((prev) =>
      prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev
    );
    setUnread(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
        className={`brutal-press relative flex items-center justify-center border-3 border-ink bg-card p-1.5 shadow-brutal-sm ${
          open ? "bg-paper" : "hover:bg-paper"
        }`}
      >
        <PixelIcon name="bell" size={18} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center border border-ink bg-accent-red px-1 font-mono text-[9px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[1100] mt-2 w-80 origin-top-right animate-pop-in border-3 border-ink bg-card shadow-brutal">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-ink px-3 py-2">
            <span className="font-display text-sm font-bold">Notifications</span>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="font-mono text-[10px] font-bold uppercase tracking-wide text-ink/60 hover:text-ink"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications === null ? (
              <p className="px-3 py-4 text-center font-mono text-xs text-ink/50">Loading…</p>
            ) : notifications && notifications.length === 0 ? (
              <p className="px-3 py-4 text-center font-mono text-xs text-ink/50">
                No notifications yet.
              </p>
            ) : (
              notifications?.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`block w-full border-b border-ink/10 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-paper ${
                    !n.readAt ? "border-l-4 border-l-accent-blue bg-accent-blue/5" : ""
                  }`}
                >
                  <p className="font-display text-xs font-bold leading-snug text-ink">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-ink/60">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-ink/40">{relTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
