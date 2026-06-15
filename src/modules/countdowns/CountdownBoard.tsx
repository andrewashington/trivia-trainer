"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import autoAnimate from "@formkit/auto-animate";
import { api } from "@/lib/client";
import { confettiCelebrate } from "@/lib/confetti";
import { useCountdown } from "@/lib/useCountdown";
import { Badge, EmptyState } from "@/components/ui";
import { PixelIcon, type IconName } from "@/components/icons";
import { CommentThread } from "@/modules/comments/CommentThread";

export type Viewer = { id: string; isAdmin: boolean };

export type TileView = {
  /** "countdown" rows are stored + deletable; the rest are derived. */
  kind: "countdown" | "event" | "birthday";
  id: string;
  title: string;
  emoji: string | null;
  targetAt: string;
  link: string | null;
  creatorId: string | null;
  creatorName: string | null;
  canDelete: boolean;
  commentCount?: number;
};

const KIND_META: Record<TileView["kind"], { icon: IconName; chip: string | null }> = {
  countdown: { icon: "clock", chip: null },
  event: { icon: "calendar", chip: "Event" },
  birthday: { icon: "cake", chip: "Birthday" },
};

function Tile({ tile, landed, viewer }: { tile: TileView; landed: boolean; viewer: Viewer }) {
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

  const href = tile.kind === "event" ? `/events/${tile.id}` : tile.kind === "birthday" ? "/contacts" : tile.link;

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
        {tile.creatorName ? (
          <>
            {" · by "}
            {tile.creatorId && !href ? (
              <Link
                href={`/people/${tile.creatorId}`}
                className="text-ink/40 no-underline hover:text-accent-blue"
              >
                {tile.creatorName}
              </Link>
            ) : (
              tile.creatorName
            )}
          </>
        ) : (
          ""
        )}
        {tile.link && !derived ? " · link ↗" : ""}
      </p>
      {tile.kind === "countdown" && (
        // Comments live inside the card, but the card may be wrapped in a
        // link — keep thread clicks from navigating.
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <CommentThread
            targetType="countdown"
            targetId={tile.id}
            initialCount={tile.commentCount ?? 0}
            viewerId={viewer.id}
            viewerIsAdmin={viewer.isAdmin}
          />
        </div>
      )}
    </div>
  );

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

function tileEmoji(t: TileView): string {
  return t.emoji ?? (t.kind === "birthday" ? "🎂" : t.kind === "event" ? "📅" : "⏳");
}
function tileHref(t: TileView): string | null {
  return t.kind === "event" ? `/events/${t.id}` : t.kind === "birthday" ? "/contacts" : t.link;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Month grid with each tile's icon dropped on its target day. */
function CalendarMonth({ tiles }: { tiles: TileView[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const byDay = useMemo(() => {
    const m = new Map<string, TileView[]>();
    for (const t of tiles) {
      const k = dayKey(new Date(t.targetAt));
      const arr = m.get(k);
      if (arr) arr.push(t);
      else m.set(k, [t]);
    }
    return m;
  }, [tiles]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayK = dayKey(today);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="brutal-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="brutal-press border-2 border-ink bg-card px-2.5 py-1 font-display font-bold shadow-brutal-sm"
        >
          ‹
        </button>
        <p className="font-display text-lg font-bold">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="brutal-press border-2 border-ink bg-card px-2.5 py-1 font-display font-bold shadow-brutal-sm"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center font-mono text-[10px] uppercase text-ink/40">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[60px]" />;
          const k = dayKey(d);
          const items = byDay.get(k) ?? [];
          const isToday = k === todayK;
          return (
            <div
              key={i}
              className={`min-h-[60px] border-2 border-ink p-1 ${isToday ? "bg-accent-yellow/40" : "bg-card"}`}
            >
              <div className="font-mono text-[10px] text-ink/50">{d.getDate()}</div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {items.slice(0, 4).map((t) => {
                  const href = tileHref(t);
                  const emoji = tileEmoji(t);
                  return href ? (
                    <Link
                      key={`${t.kind}-${t.id}`}
                      href={href}
                      title={t.title}
                      target={t.kind === "countdown" ? "_blank" : undefined}
                      className="text-base leading-none no-underline"
                    >
                      {emoji}
                    </Link>
                  ) : (
                    <span key={`${t.kind}-${t.id}`} title={t.title} className="text-base leading-none">
                      {emoji}
                    </span>
                  );
                })}
                {items.length > 4 && (
                  <span className="font-mono text-[9px] text-ink/40">+{items.length - 4}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CountdownBoard({ tiles, viewer }: { tiles: TileView[]; viewer: Viewer }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const upcomingRef = useRef<HTMLUListElement>(null);
  const landedRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (upcomingRef.current) autoAnimate(upcomingRef.current);
    if (landedRef.current) autoAnimate(landedRef.current);
  }, [view]);

  const now = Date.now();
  const upcoming = tiles.filter((t) => new Date(t.targetAt).getTime() > now);
  const landed = tiles
    .filter((t) => new Date(t.targetAt).getTime() <= now)
    .sort((a, b) => new Date(b.targetAt).getTime() - new Date(a.targetAt).getTime());

  return (
    <div className="space-y-8">
      {/* List / Calendar toggle */}
      <div className="flex gap-2">
        {(["list", "calendar"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`inline-flex items-center gap-1.5 border-3 border-ink px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${
              view === v ? "bg-accent-punch text-white" : "bg-card"
            }`}
          >
            <PixelIcon name={v === "list" ? "clock" : "calendar"} size={14} />
            {v}
          </button>
        ))}
      </div>

      {view === "calendar" && <CalendarMonth tiles={tiles} />}

      {view === "list" && (upcoming.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Nothing on the clock"
          hint="No hype on the horizon? Add something worth waiting for."
        />
      ) : (
        <ul ref={upcomingRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((t) => (
            <li key={`${t.kind}-${t.id}`}>
              <Tile tile={t} landed={false} viewer={viewer} />
            </li>
          ))}
        </ul>
      ))}

      {view === "list" && landed.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
            Recently landed
          </h2>
          <ul ref={landedRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {landed.map((t) => (
              <li key={`${t.kind}-${t.id}`}>
                <Tile tile={t} landed viewer={viewer} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
