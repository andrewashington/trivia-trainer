import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { recentActivity } from "@/lib/activity";
import { modules } from "@/modules/registry";
import { Avatar, Badge, Card, LinkButton } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { daysUntilBirthday, formatBirthday } from "@/modules/contacts/birthdays";
import { KeyBadge } from "@/modules/thekey/KeyBadge";
import { buildKeyCode } from "@/modules/thekey/keycode";

export const dynamic = "force-dynamic";

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

// Which _count fields map to which module chip on the "footprint" wall.
const STAT_DEFS: { count: string; module: string; noun: [string, string] }[] = [
  { count: "recipes", module: "cookbook", noun: ["recipe", "recipes"] },
  { count: "events", module: "events", noun: ["event planned", "events planned"] },
  { count: "listings", module: "marketplace", noun: ["listing", "listings"] },
  { count: "ideas", module: "ideas", noun: ["idea", "ideas"] },
  { count: "polls", module: "polls", noun: ["poll", "polls"] },
  { count: "wishlistItems", module: "wishlist", noun: ["wish", "wishes"] },
  { count: "mapPins", module: "map", noun: ["pin dropped", "pins dropped"] },
  { count: "files", module: "files", noun: ["file", "files"] },
  { count: "revealPrompts", module: "reveal", noun: ["reveal", "reveals"] },
  { count: "claimsCreated", module: "stakes", noun: ["shot called", "shots called"] },
  { count: "countdowns", module: "countdowns", noun: ["countdown", "countdowns"] },
  { count: "playing", module: "nowplaying", noun: ["title logged", "titles logged"] },
];

export default async function PersonPage({ params }: { params: { id: string } }) {
  const viewer = await currentUser();
  if (!viewer) redirect("/signin");

  const [person, activity] = await Promise.all([
    db.user.findUnique({
      where: { id: params.id },
      include: {
        contactCard: { include: { relatedParties: true } },
        playing: {
          where: { status: "active" },
          orderBy: { updatedAt: "desc" },
          take: 6,
        },
        _count: {
          select: {
            recipes: true,
            events: true,
            listings: true,
            ideas: true,
            polls: true,
            wishlistItems: true,
            mapPins: true,
            files: true,
            revealPrompts: true,
            claimsCreated: true,
            countdowns: true,
            playing: true,
          },
        },
      },
    }),
    recentActivity(14, params.id),
  ]);
  if (!person) notFound();

  // The Key: only the encoded string, only if its owner left it visible.
  const keySub = await db.keySubmission.findUnique({ where: { userId: params.id } });
  const keyCode = keySub && keySub.visibility === "group" ? buildKeyCode(keySub) : null;

  const isMe = viewer.id === person.id;
  const card = person.contactCard;
  const bdayDays = card?.birthday ? daysUntilBirthday(card.birthday) : null;
  const counts = person._count as unknown as Record<string, number>;
  const stats = STAT_DEFS.filter((s) => (counts[s.count] ?? 0) > 0);
  const totalThings = stats.reduce((sum, s) => sum + counts[s.count], 0);
  const joined = person.createdAt.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ---- Hero: who this is ---- */}
      <Card className="tilt-l !p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={person.displayName} src={person.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl leading-tight sm:text-4xl">
              {person.displayName}
              {isMe && <span className="text-ink/40"> (you)</span>}
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-widest text-ink/50">
              member since {joined}
            </p>
          </div>
          {isMe && (
            <LinkButton href="/me" variant="yellow">
              Edit
            </LinkButton>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className={person.role === "admin" ? "bg-accent-grape text-white" : "bg-paper"}>
            {person.role}
          </Badge>
          {bdayDays !== null && (
            <Badge className={bdayDays <= 7 ? "bg-accent-yellow" : "bg-paper"}>
              <PixelIcon name="cake" size={12} className="-mt-0.5 mr-1 inline" />
              {formatBirthday(card!.birthday!)}
              {bdayDays === 0 ? " · TODAY" : bdayDays <= 30 ? ` · in ${bdayDays}d` : ""}
            </Badge>
          )}
          {person.venmoHandle && (
            <a
              href={`https://venmo.com/u/${person.venmoHandle}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block border-2 border-ink bg-accent-cyan px-2 py-0.5 font-mono text-xs font-bold uppercase no-underline"
            >
              @{person.venmoHandle} on venmo
            </a>
          )}
          {totalThings > 0 && (
            <Badge className="bg-paper">{totalThings} things made</Badge>
          )}
        </div>
      </Card>

      {/* ---- The Key: a sealed curio for those who know ---- */}
      {keyCode && (
        <Card className="tilt-r">
          <p className="brutal-label flex items-center gap-1.5">
            <PixelIcon name="door-closed" size={14} /> The Key
          </p>
          <KeyBadge keyCode={keyCode} isMe={isMe} />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink/40">
            an encoded field-guide entry · readable only with the chart
          </p>
        </Card>
      )}

      {/* ---- Footprint: what they've contributed, module by module ---- */}
      {stats.length > 0 && (
        <div>
          <SectionTitle icon="zap" bg="bg-accent-yellow">
            Footprint
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {stats.map((s) => {
              const mod = MOD[s.module];
              const bg = mod?.accentBg ?? "bg-paper";
              const n = counts[s.count];
              return (
                <Link
                  key={s.module}
                  href={mod?.href ?? "/"}
                  className={`brutal-press inline-flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide no-underline shadow-brutal-sm ${bg} ${onAccent(bg)}`}
                >
                  {mod && <PixelIcon name={mod.icon} size={13} />}
                  {n} {n === 1 ? s.noun[0] : s.noun[1]}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- On their screen/nightstand right now ---- */}
      {person.playing.length > 0 && (
        <div>
          <SectionTitle icon="tv" bg="bg-accent-orange">
            Currently into
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {person.playing.map((item) => (
              <Link key={item.id} href="/nowplaying" className="no-underline">
                <div className="flex items-center gap-3 border-2 border-ink bg-card px-3 py-2 shadow-brutal-sm transition-transform hover:-translate-y-0.5">
                  {item.posterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                      alt=""
                      className="h-14 w-10 shrink-0 border-2 border-ink object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center border-2 border-ink bg-accent-yellow">
                      <PixelIcon name={item.mediaType === "book" ? "book-open" : "tv"} size={18} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold leading-tight">{item.title}</p>
                    <p className="font-mono text-[10px] uppercase text-ink/50">
                      {item.mediaType === "book" ? "reading" : "watching"}
                      {item.releaseYear ? ` · ${item.releaseYear}` : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ---- Reach them ---- */}
      <div>
        <SectionTitle icon="contact" bg="bg-accent-pink">
          Reach {isMe ? "you" : person.displayName.split(" ")[0]}
        </SectionTitle>
        <Card>
          <dl className="space-y-1.5 text-sm">
            <ContactRow label="email" value={card?.email ?? person.email} href={`mailto:${card?.email ?? person.email}`} />
            {card?.phone && <ContactRow label="phone" value={card.phone} href={`tel:${card.phone}`} />}
            {card?.address && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 pt-0.5 font-mono text-xs uppercase text-ink/40">addr</dt>
                <dd className="whitespace-pre-wrap">{card.address}</dd>
              </div>
            )}
            {card?.notes && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 pt-0.5 font-mono text-xs uppercase text-ink/40">note</dt>
                <dd className="italic text-ink/60">{card.notes}</dd>
              </div>
            )}
          </dl>
          {card && card.relatedParties.length > 0 && (
            <div className="mt-3 border-t-2 border-dashed border-ink/30 pt-2">
              {card.relatedParties.map((rp) => (
                <p key={rp.id} className="text-sm">
                  <span className="font-bold">{rp.name}</span>
                  {rp.relation && <span className="font-mono text-xs text-ink/50"> ({rp.relation})</span>}
                  {rp.phone && <span className="text-ink/70"> · {rp.phone}</span>}
                  {rp.email && <span className="text-ink/70"> · {rp.email}</span>}
                </p>
              ))}
            </div>
          )}
          {!card && (
            <p className="text-sm italic text-ink/40">
              No contact card yet{isMe ? " — add yours on the You page." : "."}
            </p>
          )}
        </Card>
      </div>

      {/* ---- Their slice of the group feed ---- */}
      <div>
        <SectionTitle icon="clock" bg="bg-accent-green">
          Lately
        </SectionTitle>
        {activity.length === 0 ? (
          <Card className="tilt-r text-sm italic text-ink/50">
            Nothing yet — {isMe ? "go make something!" : "the lurk is strong with this one."}
          </Card>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((item) => {
              const mod = MOD[item.module];
              const bg = mod?.accentBg ?? "bg-accent-blue";
              return (
                <li key={`${item.module}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 border-2 border-ink bg-card px-2.5 py-1.5 no-underline shadow-brutal-sm transition-transform hover:-translate-y-0.5"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink ${bg} ${onAccent(bg)}`}
                    >
                      <PixelIcon name={mod?.icon ?? "zap"} size={14} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-snug">
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
        )}
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  bg,
  children,
}: {
  icon: Parameters<typeof PixelIcon>[0]["name"];
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={`mb-3 inline-flex items-center gap-2 border-2 border-ink px-3 py-1 font-display text-lg font-bold shadow-brutal-sm ${bg} ${onAccent(bg)}`}
    >
      <PixelIcon name={icon} size={18} />
      {children}
    </h2>
  );
}

function ContactRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 pt-0.5 font-mono text-xs uppercase text-ink/40">{label}</dt>
      <dd className="min-w-0 truncate">
        {href ? (
          <a href={href} className="text-accent-blue">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
