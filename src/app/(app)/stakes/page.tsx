import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ModuleHeader } from "@/components/ModuleHeader";
import { PixelIcon } from "@/components/icons";
import { ClaimForm } from "@/modules/stakes/ClaimForm";
import { HeroBanner } from "@/components/Hero";
import { Countdown } from "@/components/Countdown";
import { ClaimCard, type ClaimView } from "@/modules/stakes/ClaimCard";
import { Wheel } from "@/modules/stakes/Wheel";

export const metadata = { title: "Stakes" };
export const dynamic = "force-dynamic";

export default async function StakesPage({
  searchParams,
}: {
  searchParams: { history?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const showHistory = searchParams.history === "1";

  const [claims, forfeits, spins, members] = await Promise.all([
    db.claim.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        counterparty: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    }),
    db.forfeit.findMany({
      orderBy: { createdAt: "asc" },
      include: { author: { select: { displayName: true, avatarUrl: true } } },
    }),
    db.forfeitSpin.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        forfeit: { select: { text: true } },
        target: { select: { displayName: true, avatarUrl: true } },
        spunBy: { select: { displayName: true, avatarUrl: true } },
      },
    }),
    db.user.findMany({ select: { id: true, displayName: true, avatarUrl: true }, orderBy: { displayName: "asc" } }),
  ]);

  const toView = (c: (typeof claims)[number]): ClaimView => {
    const isParty = c.creatorId === user.id || c.counterpartyId === user.id;
    const isAdmin = user.role === "admin";
    return {
      id: c.id,
      // Concealment: hidden + open claims mask text from non-authors.
      text: c.hidden && c.outcome === null && c.creatorId !== user.id ? null : c.text,
      resolvesAt: c.resolvesAt.toISOString(),
      hidden: c.hidden,
      creatorName: c.creator.displayName,
      counterpartyName: c.counterparty?.displayName ?? null,
      stake: c.stake,
      outcome: c.outcome,
      settledAt: c.settledAt?.toISOString() ?? null,
      canResolve: isParty || isAdmin,
      canOverride: isAdmin && c.outcome !== null,
      canDelete: c.creatorId === user.id || isAdmin,
      isParty,
    };
  };

  const open = claims.filter((c) => c.outcome === null);
  const resolved = claims.filter((c) => c.outcome !== null);

  // Oracle standings: accuracy on claims you authored (void excluded).
  const standings = members
    .map((m) => {
      const mine = resolved.filter((c) => c.creatorId === m.id && c.outcome !== "void");
      const right = mine.filter((c) => c.outcome === "right").length;
      return { name: m.displayName, avatarUrl: m.avatarUrl, right, total: mine.length };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.right - a.right || b.right / b.total - a.right / a.total);

  // Favor ledger: resolved, staked, unsettled bets.
  const ledger = resolved
    .filter((c) => c.stake && c.counterparty && c.outcome !== "void" && !c.settledAt)
    .map((c) => ({
      id: c.id,
      loser: c.outcome === "right" ? c.counterparty!.displayName : c.creator.displayName,
      winner: c.outcome === "right" ? c.creator.displayName : c.counterparty!.displayName,
      stake: c.stake!,
    }));

  return (
    <div className="space-y-6">
      {showHistory ? (
        <PageHeader
          title="The Record"
          icon="notebook"
          accentBg="bg-accent-forest text-white"
          action={
            <Link
              href="/stakes"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              ← Live claims
            </Link>
          }
        />
      ) : (
        <ModuleHeader
          title="Stakes"
          icon="target"
          accentBg="bg-accent-forest text-white"
          addLabel="Claim"
          extra={
            <Link
              href="/stakes?history=1"
              className="brutal-press border-2 border-ink bg-card px-3 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm"
            >
              The record ({resolved.length})
            </Link>
          }
        >
          <ClaimForm members={members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.displayName }))} />
        </ModuleHeader>
      )}

      {!showHistory && (() => {
        // Hero: an overdue verdict screams; otherwise the next deadline ticks.
        const now = new Date();
        const overdue = open.filter((c) => c.resolvesAt < now);
        const nextUp = open.filter((c) => c.resolvesAt >= now).sort((a, b) => a.resolvesAt.getTime() - b.resolvesAt.getTime())[0];
        const champ = standings[0];
        if (overdue.length > 0) {
          const c = overdue[0];
          return (
            <HeroBanner accentBg="bg-accent-yellow" pattern="rays" kicker="Verdict time" kickerIcon="target" pulse jumpTo={`claim-${c.id}`} jumpLabel="Rule on it ↓">
              <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                {c.hidden ? "A hidden claim awaits judgment…" : `“${c.text}”`}
              </h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink/70">
                {c.creator.displayName}
                {c.counterparty ? ` vs ${c.counterparty.displayName}` : " called it"}
                {c.stake ? ` · stake: ${c.stake}` : ""} — deadline passed. Someone rule on it. ↓
              </p>
              {overdue.length > 1 && (
                <p className="mt-1 font-mono text-[10px] uppercase text-ink/50">
                  +{overdue.length - 1} more awaiting verdicts
                </p>
              )}
            </HeroBanner>
          );
        }
        if (nextUp) {
          return (
            <HeroBanner accentBg="bg-accent-forest text-white" pattern="stripes" kicker="On the line" kickerIcon="target" jumpTo={`claim-${nextUp.id}`} jumpLabel="See the claim ↓">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                    {nextUp.hidden ? "A hidden prediction resolves soon…" : `“${nextUp.text}”`}
                  </h2>
                  <p className="mt-2 font-mono text-xs uppercase tracking-wide text-white/80">
                    {nextUp.creator.displayName}
                    {nextUp.counterparty ? ` vs ${nextUp.counterparty.displayName}` : ""}
                    {nextUp.stake ? ` · ${nextUp.stake}` : ""}
                  </p>
                </div>
                <p className="border-2 border-ink bg-ink px-3 py-1 font-display text-2xl font-bold tabular-nums text-accent-yellow shadow-brutal-sm">
                  <Countdown to={nextUp.resolvesAt.toISOString()} doneText="JUDGE IT" />
                </p>
              </div>
              {champ && champ.total > 0 && (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-white/60">
                  Reigning oracle: {champ.name} ({champ.right}/{champ.total} right)
                </p>
              )}
            </HeroBanner>
          );
        }
        return null;
      })()}

      {showHistory ? (
        <>
          {ledger.length > 0 && (
            <Card className="tilt-l">
              <p className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="notebook" size={14} /> The favor ledger
              </p>
              <ul className="space-y-1">
                {ledger.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <strong>{entry.loser}</strong> owes <strong>{entry.winner}</strong>:{" "}
                    {entry.stake}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {standings.length > 0 && (
            <Card className="tilt-r">
              <p className="brutal-label flex items-center gap-1.5">
                <PixelIcon name="sparkles" size={14} /> Oracle standings
              </p>
              <ul className="space-y-1.5">
                {standings.map((s, i) => (
                  <li key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="font-display font-bold">
                      {i === 0 ? <PixelIcon name="crown" size={16} className="-mt-0.5 inline" /> : `${i + 1}.`}
                    </span>
                    <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                    <span className="font-bold">{s.name}</span>
                    <Badge className="ml-auto bg-paper">
                      {s.right}/{s.total} · {Math.round((s.right / s.total) * 100)}%
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {resolved.length === 0 ? (
            <EmptyState
              icon="notebook"
              title="The record is blank"
              hint="No verdicts yet. Resolve a claim and history begins."
            />
          ) : (
            <ul className="space-y-4">
              {resolved.map((c) => (
                <ClaimCard key={c.id} claim={toView(c)} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {open.length === 0 ? (
            <EmptyState
              icon="chess"
              title="No claims on the record"
              hint="Call a shot. Put a coffee on it. Become the oracle."
            />
          ) : (
            <ul className="space-y-4">
              {open.map((c) => (
                <ClaimCard key={c.id} claim={toView(c)} />
              ))}
            </ul>
          )}
        
      <Wheel
        members={members.map((m) => ({ id: m.id, name: m.displayName }))}
        forfeitCount={forfeits.length}
      />

      {(forfeits.length > 0 || spins.length > 0) && (
        <div className="space-y-3">
          {forfeits.length > 0 && (
            <Card>
              <p className="brutal-label">The pool</p>
              <ul className="space-y-1">
                {forfeits.map((f) => (
                  <li key={f.id} className="text-sm">
                    <PixelIcon name="skull" size={14} className="-mt-0.5 mr-1 inline" />
                    {f.text}{" "}
                    <span className="font-mono text-[10px] uppercase text-ink/40">
                      — {f.author.displayName}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {spins.length > 0 && (
            <Card>
              <p className="brutal-label">Spin history</p>
              <ul className="space-y-1">
                {spins.map((s) => (
                  <li key={s.id} className="text-sm">
                    <strong>{s.target.displayName}</strong> got &ldquo;{s.forfeit.text}&rdquo;
                    {s.reason && <span className="text-ink/60"> ({s.reason})</span>}
                    <span className="font-mono text-[10px] uppercase text-ink/40">
                      {" "}
                      — spun by {s.spunBy.displayName},{" "}
                      {s.createdAt.toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
            </>
      )}
    </div>
  );
}
