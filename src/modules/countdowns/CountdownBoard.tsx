"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import autoAnimate from "@formkit/auto-animate";
import { api } from "@/lib/client";
import { confettiCelebrate } from "@/lib/confetti";
import { useCountdown } from "@/lib/useCountdown";
import { Badge, EmptyState } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";

export type TileView = {
  /** "countdown" rows are stored + deletable; the rest are derived. */
  kind: "countdown" | "event" | "birthday";
  id: string;
  title: string;
  emoji: string | null;
  targetAt: string;
  link: string | null;
  creatorName: string | null;
  canDelete: boolean;
};

const KIND_META: Record<TileView["kind"], { icon: IconName; chip: string | null }> = {
  countdown: { icon: "clock", chip: null },
  event: { icon: "calendar", chip: "Event" },
  birthday: { icon: "cake", chip: "Birthday" },
};

function Tile({ tile, landed }: { tile: TileView; landed: boolean }) {
  const router = useRouter();
  const t = useCountdown(tile.targetAt);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const meta = KIND_META[tile.kind];
  const derived = tile.kind !== "countdown";

  // The payoff: confetti when a clock hits zero while you're watching.
  // wasTicking guards against firing for already-landed tiles on mount.
  const wasTicking = useRef(false);
  useEffect(() => {
    if (t.ready && !t.done) wasTicking.current = true;
    if (t.ready && t.done && wasTicking.current) {
      wasTicking.current = false;
      confettiCelebrate();
      router.refresh();
    }
  }, [t.ready, t.done, router]);

  async function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/countdowns/${tile.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  const when = new Date(tile.targetAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const body = (
    <div
      className={`brutal-card relative h-full p-4 ${landed ? "opacity-70" : ""} ${
        derived ? "border-dashed" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl leading-none">{tile.emoji ?? (derived ? (tile.kind === "birthday" ? "🎂" : "📅") : "⏳")}</span>
        <span className="flex items-center gap-1.5">
          {meta.chip && (
            <Badge className="inline-flex items-center gap-1 bg-paper">
              <PixelIcon name={meta.icon} size={12} /> {meta.chip}
            </Badge>
          )}
          {tile.canDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              disabled={busy}
              className={`brutal-press border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-brutal-sm ${
                armed ? "bg-accent-red text-white" : "bg-card"
              }`}
            >
              {armed ? "Sure?" : "✕"}
            </button>
          )}
        </span>
      </div>
      <p className="mt-2 font-display text-xl font-bold leading-tight">{tile.title}</p>
      <p className="mt-2 inline-block border-2 border-ink bg-ink px-2.5 py-1 font-display text-2xl font-bold tabular-nums text-accent-yellow shadow-brutal-sm">
        {!t.ready ? "—" : t.done ? "LANDED 🎉" : t.label}
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase text-ink/40">
        {when}
        {tile.creatorName ? ` · by ${tile.creatorName}` : ""}
        {tile.link && !derived ? " · link ↗" : ""}
      </p>
    </div>
  );

  const href = tile.kind === "event" ? `/events/${tile.id}` : tile.kind === "birthday" ? "/contacts" : tile.link;
  return href ? (
    <Link
      href={href}
      target={tile.kind === "countdown" ? "_blank" : undefined}
      className="block no-underline transition-transform hover:-translate-y-1"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function CountdownBoard({ tiles }: { tiles: TileView[] }) {
  const upcomingRef = useRef<HTMLUListElement>(null);
  const landedRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (upcomingRef.current) autoAnimate(upcomingRef.current);
    if (landedRef.current) autoAnimate(landedRef.current);
  }, []);

  const now = Date.now();
  const upcoming = tiles.filter((t) => new Date(t.targetAt).getTime() > now);
  const landed = tiles
    .filter((t) => new Date(t.targetAt).getTime() <= now)
    .sort((a, b) => new Date(b.targetAt).getTime() - new Date(a.targetAt).getTime());

  return (
    <div className="space-y-8">
      {upcoming.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Nothing on the clock"
          hint="No hype on the horizon? Add something worth waiting for."
        />
      ) : (
        <ul ref={upcomingRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((t) => (
            <li key={`${t.kind}-${t.id}`}>
              <Tile tile={t} landed={false} />
            </li>
          ))}
        </ul>
      )}

      {landed.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
            Recently landed
          </h2>
          <ul ref={landedRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {landed.map((t) => (
              <li key={`${t.kind}-${t.id}`}>
                <Tile tile={t} landed />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
