import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { recentActivity, type Activity } from "@/lib/activity";
import { onThisDayFact } from "@/lib/numbersFact";
import { modules } from "@/modules/registry";
import { Avatar } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { PixelIcon } from "@/components/icons";
import { OpenLauncherButton } from "@/components/command/OpenLauncherButton";
import { getPetView, MOOD_META, MOOD_LABEL } from "@/modules/pet/engine";
import { Creature } from "@/modules/pet/Creature";

export const dynamic = "force-dynamic";

// Module key -> nav icon + accent, for tinting feed rows and chips.
const MOD = Object.fromEntries(modules.map((m) => [m.key, m]));
const DARK_ACCENTS = new Set([
  "bg-accent-blue",
  "bg-accent-forest",
  "bg-accent-indigo",
  "bg-accent-magenta",
  "bg-accent-punch",
  "bg-ink",
]);
const onAccent = (bg: string) => (DARK_ACCENTS.has(bg) ? "text-white" : "text-ink");

// One saying per hour of the day. Each reads as a salutation — the header
// renders `${saying}, ${firstName}.`
const HOURLY_GREETINGS = [
  "Burning the midnight oil", // 0
  "It's 1am and you're here", // 1
  "Still up at 2am, huh", // 2
  "It's 3am — this can't be good", // 3
  "Up before the birds", // 4
  "Dawn patrol", // 5
  "Rise and shine", // 6
  "Top of the morning", // 7
  "Breakfast hours", // 8
  "Morning's in full swing", // 9
  "Peak productivity hours", // 10
  "Almost lunchtime", // 11
  "High noon", // 12
  "Post-lunch power hour", // 13
  "Mid-afternoon already", // 14
  "Three o'clock slump check", // 15
  "The home stretch", // 16
  "Quitting time", // 17
  "Dinner o'clock", // 18
  "Golden hour", // 19
  "Prime time", // 20
  "The night is young", // 21
  "Getting cozy", // 22
  "One last scroll", // 23
];

// The server clock is UTC on Railway, so the greeting buckets by the
// group's home timezone (override with HOME_TIMEZONE if the group moves).
const HOME_TZ = process.env.HOME_TIMEZONE ?? "America/Denver";

function greeting(): string {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: HOME_TZ,
      }).format(new Date())
    );
  } catch {
    hour = new Date().getHours(); // bad TZ value — fall back to server time
  }
  return HOURLY_GREETINGS[hour % 24] ?? "Good day";
}

function timeAgo(d: Date): string {
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  const w = Math.round(days / 7);
  return w < 5 ? `${w}w` : `${Math.round(days / 30)}mo`;
}

// Bucket feed items into day groups for the scrollable feed tile.
function dayGroup(d: Date): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Earlier";
}

type NeedsYouItem = {
  key: string;
  verb: string;
  text: string;
  detail: string;
  href: string;
  action: string;
  actionBg: string;
};

export default async function HomePage() {
  const user = await currentUser();
  const now = new Date();
  const [
    activity,
    nextEvent,
    nextCountdown,
    latestPoll,
    unvotedPolls,
    unrsvpdEvent,
    claimsDue,
    openClaims,
    latestPlaying,
    activeCount,
    pet,
    tanksWaiting,
    fact,
  ] = await Promise.all([
    recentActivity(30),
    db.event.findFirst({
      where: { startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include: { rsvps: true },
    }),
    db.countdown.findFirst({
      where: { targetAt: { gte: now } },
      orderBy: { targetAt: "asc" },
    }),
    db.poll.findFirst({
      where: { closedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { votes: true } } },
    }),
    user
      ? db.poll.findMany({
          where: { closedAt: null, votes: { none: { userId: user.id } } },
          orderBy: { createdAt: "desc" },
          take: 2,
          include: { _count: { select: { votes: true } } },
        })
      : [],
    user
      ? db.event.findFirst({
          where: { startAt: { gte: now }, rsvps: { none: { userId: user.id } } },
          orderBy: { startAt: "asc" },
        })
      : null,
    db.claim.findMany({
      where: { outcome: null, resolvesAt: { lte: now } },
      orderBy: { resolvesAt: "asc" },
      take: 2,
      include: { creator: { select: { displayName: true } } },
    }),
    db.claim.findMany({
      where: { outcome: null },
      orderBy: { resolvesAt: "asc" },
      select: { resolvesAt: true },
    }),
    db.nowPlayingItem.findFirst({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
    }),
    db.nowPlayingItem.count({ where: { status: "active" } }),
    user ? getPetView(user.id) : null,
    user
      ? db.tanksGame.findMany({
          where: { status: "active", currentPlayerId: user.id },
          orderBy: { updatedAt: "asc" },
          take: 2,
          include: {
            challenger: { select: { id: true, displayName: true } },
            opponent: { select: { id: true, displayName: true } },
          },
        })
      : [],
    onThisDayFact(),
  ]);

  const firstName = user?.displayName.split(" ")[0] ?? "friend";

  // ---- The "needs you" strip: things actually waiting on this member.
  const needsYou: NeedsYouItem[] = [
    ...unvotedPolls.map((p) => ({
      key: `poll-${p.id}`,
      verb: "Vote",
      text: p.question,
      detail: p._count.votes === 0 ? "be the first in" : `${p._count.votes} already in`,
      href: "/polls",
      action: "vote",
      actionBg: "bg-accent-indigo text-white",
    })),
    ...(unrsvpdEvent
      ? [
          {
            key: `event-${unrsvpdEvent.id}`,
            verb: "RSVP",
            text: unrsvpdEvent.title,
            detail: unrsvpdEvent.startAt.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
            href: `/events/${unrsvpdEvent.id}`,
            action: "rsvp",
            actionBg: "bg-accent-blue text-white",
          },
        ]
      : []),
    ...tanksWaiting.map((g) => {
      const opp = g.challengerId === user?.id ? g.opponent : g.challenger;
      return {
        key: `tanks-${g.id}`,
        verb: "Fire",
        text: `tank duel vs ${opp.displayName.split(" ")[0]}`,
        detail: "your shot",
        href: `/tanks/${g.id}`,
        action: "fire",
        actionBg: "bg-accent-orange text-ink",
      };
    }),
    ...claimsDue.map((c) => ({
      key: `claim-${c.id}`,
      verb: "Judge",
      text: c.text,
      detail: `${c.creator.displayName.split(" ")[0]}'s claim is due`,
      href: "/stakes",
      action: "rule",
      actionBg: "bg-accent-forest text-white",
    })),
  ].slice(0, 3);

  // ---- Feed, bucketed by day for the scrollable tile.
  const feedGroups: [string, Activity[]][] = [];
  for (const item of activity) {
    const g = dayGroup(item.at);
    const last = feedGroups[feedGroups.length - 1];
    if (last && last[0] === g) last[1].push(item);
    else feedGroups.push([g, [item]]);
  }

  const soonestClaim = openClaims[0]?.resolvesAt ?? null;

  // Modules with a live bento tile right now; everything else becomes a chip.
  const tiled = new Set(["events", "pet", "polls", "nowplaying", "stakes"]);
  if (nextCountdown) tiled.add("countdowns");
  const chipModules = modules.filter((m) => !tiled.has(m.key) && !m.hidden);

  const tileLabel = "brutal-label !mb-0 text-[10px] opacity-60";

  return (
    <div className="space-y-5 pt-2">
      {/* Header: greeting + the single launcher. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="brutal-card inline-block -rotate-1 px-5 py-3">
          <h1 className="text-2xl sm:text-3xl">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-ink/50">
            The group home base
          </p>
          {fact && (
            <p className="mt-1 max-w-md font-mono text-[10px] uppercase tracking-wide text-ink/40">
              On this day · {fact.text}
            </p>
          )}
        </div>
        <OpenLauncherButton />
      </div>

      {/* Needs you: only rendered when something is actually waiting. */}
      {needsYou.length > 0 && (
        <div className="brutal-card -rotate-[0.4deg] bg-accent-yellow p-3 sm:p-4">
          <p className="brutal-label border-b-2 border-ink pb-1">
            Needs you · {needsYou.length} thing{needsYou.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {needsYou.map((n) => (
              <li key={n.key}>
                <Link
                  href={n.href}
                  className="flex items-center gap-3 border-2 border-ink bg-card px-3 py-2 no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-bold">{n.verb}:</span> {n.text}{" "}
                    <span className="text-ink/55">— {n.detail}</span>
                  </span>
                  <span
                    className={`shrink-0 border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${n.actionBg}`}
                  >
                    {n.action}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The bento: scrollable feed tile + live module tiles. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="brutal-card flex flex-col overflow-hidden sm:col-span-2 lg:row-span-3">
          <div className="flex items-center justify-between border-b-3 border-ink px-4 py-2.5">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide">
              <PixelIcon name="zap" size={16} /> What&apos;s new
            </h2>
            <span className="font-mono text-[10px] uppercase text-ink/40">scroll ↓</span>
          </div>
          <div className="brutal-scroll h-[26rem] flex-1 overflow-y-auto px-3 py-2 lg:h-auto lg:max-h-[34rem]">
            {activity.length === 0 ? (
              <p className="p-2 text-sm text-ink/60">
                Quiet in here. Hit “Do something” to get the group going →
              </p>
            ) : (
              feedGroups.map(([group, items]) => (
                <div key={group}>
                  <p className="my-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink/45 after:h-0 after:flex-1 after:border-t-2 after:border-dashed after:border-ink/25 after:content-['']">
                    {group}
                  </p>
                  <ul className="space-y-1.5">
                    {items.map((item) => {
                      const mod = MOD[item.module];
                      const bg = mod?.accentBg ?? "bg-accent-blue";
                      return (
                        <li
                          key={`${item.module}-${item.id}`}
                          className="flex items-center gap-2.5 border-2 border-ink bg-card px-2.5 py-1.5 shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                        >
                          <Link
                            href={`/people/${item.actorId}`}
                            className="shrink-0"
                            title={`${item.actor}'s profile`}
                          >
                            <Avatar name={item.actor} src={item.actorAvatarUrl} size="sm" />
                          </Link>
                          <Link
                            href={item.href}
                            className="flex min-w-0 flex-1 items-center gap-2.5 no-underline"
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink ${bg} ${onAccent(bg)}`}
                            >
                              <PixelIcon name={mod?.icon ?? "zap"} size={14} />
                            </span>
                            <span className="min-w-0 flex-1 text-sm leading-snug">
                              <span className="font-bold">{item.actor}</span>{" "}
                              <span className="text-ink/60">{item.verb}</span>{" "}
                              <span className="font-bold">{item.title}</span>
                            </span>
                            <span className="shrink-0 font-mono text-[10px] uppercase text-ink/40">
                              {timeAgo(item.at)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Events: next up. */}
        <Link
          href={nextEvent ? `/events/${nextEvent.id}` : "/events"}
          className="no-underline sm:col-span-2"
        >
          <div className="brutal-card h-full bg-accent-blue p-4 text-white transition-transform hover:-translate-y-1">
            <span className={`${tileLabel} flex items-center gap-1.5 text-white opacity-80`}>
              <PixelIcon name="calendar" size={13} /> Events · next up
            </span>
            {nextEvent ? (
              <>
                <p className="mt-1 font-display text-xl font-bold leading-tight">{nextEvent.title}</p>
                <p className="mt-1 text-sm opacity-90">
                  {nextEvent.startAt.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {nextEvent.rsvps.filter((r) => r.status === "going").length} going
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm opacity-90">Nothing scheduled. Plan something →</p>
            )}
          </div>
        </Link>

        {/* Pet: the group vibe. */}
        {pet && (
          <Link href="/pet" className="no-underline">
            <div
              className={`brutal-card flex h-full items-center gap-3 p-3 transition-transform hover:-translate-y-1 ${MOOD_META[pet.mood].bg}`}
            >
              <span className="shrink-0">
                <Creature mood={pet.mood} size={44} stage={pet.stage} beloved={pet.beloved} />
              </span>
              <div className="min-w-0">
                <span className={tileLabel}>Pet</span>
                <p className="truncate font-display text-sm font-bold leading-tight">
                  {pet.name}: {MOOD_LABEL[pet.mood]}
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* Polls: latest open. */}
        <Link href="/polls" className="no-underline">
          <div className="brutal-card h-full bg-accent-indigo p-3 text-white transition-transform hover:-translate-y-1">
            <span className={`${tileLabel} text-white opacity-80`}>Polls</span>
            {latestPoll ? (
              <>
                <p className="mt-0.5 line-clamp-2 font-display text-sm font-bold leading-tight">
                  {latestPoll.question}
                </p>
                <p className="mt-0.5 text-xs opacity-85">
                  {latestPoll._count.votes} vote{latestPoll._count.votes === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-xs opacity-85">No open polls →</p>
            )}
          </div>
        </Link>

        {/* Now playing. */}
        <Link href="/nowplaying" className="no-underline">
          <div className="brutal-card h-full bg-accent-yellow p-3 transition-transform hover:-translate-y-1">
            <span className={tileLabel}>Now playing</span>
            {latestPlaying ? (
              <>
                <p className="mt-0.5 line-clamp-2 font-display text-sm font-bold leading-tight">
                  {latestPlaying.title}
                </p>
                <p className="mt-0.5 text-xs text-ink/60">{activeCount} active</p>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-ink/60">Nothing on →</p>
            )}
          </div>
        </Link>

        {/* Stakes. */}
        <Link href="/stakes" className="no-underline">
          <div className="brutal-card h-full bg-accent-forest p-3 text-white transition-transform hover:-translate-y-1">
            <span className={`${tileLabel} text-white opacity-80`}>Stakes</span>
            <p className="mt-0.5 font-display text-sm font-bold leading-tight">
              {openClaims.length} open claim{openClaims.length === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-xs opacity-85">
              {soonestClaim
                ? soonestClaim <= now
                  ? "awaiting judgment"
                  : `next due ${soonestClaim.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : "call a shot →"}
            </p>
          </div>
        </Link>

        {/* Counting down: only when something is on the hype clock. */}
        {nextCountdown && (
          <Link href="/countdowns" className="no-underline">
            <div className="brutal-card h-full bg-accent-punch p-3 text-white transition-transform hover:-translate-y-1">
              <span className={`${tileLabel} flex items-center gap-1.5 text-white opacity-80`}>
                <PixelIcon name="clock" size={13} /> Counting down
              </span>
              <p className="mt-0.5 line-clamp-1 font-display text-sm font-bold leading-tight">
                {nextCountdown.emoji ? `${nextCountdown.emoji} ` : ""}
                {nextCountdown.title}
              </p>
              <p className="mt-0.5 text-xs tabular-nums opacity-85">
                <Countdown to={nextCountdown.targetAt.toISOString()} doneText="IT LANDED" />
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* Everything else: one chip per module without a live tile. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink/45">
          Everything else:
        </span>
        {chipModules.map((m) => (
          <Link
            key={m.key}
            href={m.href}
            className={`brutal-press inline-flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide no-underline shadow-brutal-sm ${m.accentBg} ${onAccent(m.accentBg)}`}
          >
            <PixelIcon name={m.icon} size={13} />
            {m.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
