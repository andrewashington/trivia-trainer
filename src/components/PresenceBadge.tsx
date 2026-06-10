"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui";

type OnlineUser = { id: string; displayName: string; avatarUrl: string | null };

const HEARTBEAT_MS = 60 * 1000;

/**
 * Lightweight "who's here" widget for the header: heartbeats the presence
 * endpoint and shows the other members currently online as a stack of
 * avatars with a live dot. Renders nothing when you're alone.
 */
export function PresenceBadge() {
  const [online, setOnline] = useState<OnlineUser[]>([]);

  useEffect(() => {
    let stop = false;
    async function beat() {
      try {
        // Plain fetch (not api()): a heartbeat must not trigger the
        // coins:refresh listener that fires on every non-GET api() call.
        const res = await fetch("/api/presence", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { online: OnlineUser[] };
        if (!stop) setOnline(data.online);
      } catch {
        // Offline/transient — try again next tick.
      }
    }
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    // Refresh promptly when the tab comes back into focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (online.length === 0) return null;

  const shown = online.slice(0, 4);
  const extra = online.length - shown.length;
  const names = online.map((u) => u.displayName).join(", ");

  return (
    <div
      className="flex items-center gap-1.5 border-2 border-ink bg-card px-2 py-1 shadow-brutal-sm"
      title={`Online now: ${names}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green" />
      </span>
      <div className="flex -space-x-2">
        {shown.map((u) => (
          <Link key={u.id} href={`/people/${u.id}`} className="no-underline" title={u.displayName}>
            <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />
          </Link>
        ))}
      </div>
      {extra > 0 && <span className="font-mono text-[10px] font-bold text-ink/60">+{extra}</span>}
    </div>
  );
}
