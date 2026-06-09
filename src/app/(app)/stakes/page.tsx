import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ClaimForm } from "@/modules/stakes/ClaimForm";
import { ClaimCard, type ClaimView } from "@/modules/stakes/ClaimCard";
import { Wheel } from "@/modules/stakes/Wheel";

export const metadata = { title: "Stakes" };
export const dynamic = "force-dynamic";

export default async function StakesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const [claims, forfeits, spins, members] = await Promise.all([
    db.claim.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, displayName: true } },
        counterparty: { select: { id: true, displayName: true } },
      },
    }),
    db.forfeit.findMany({
      orderBy: { createdAt: "asc" },
      include: { author: { select: { displayName: true } } },
    }),
    db.forfeitSpin.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        forfeit: { select: { text: true } },
        target: { select: { displayName: true } },
        spunBy: { select: { displayName: true } },
      },
    }),
    db.user.findMany({ select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
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
      return { name: m.displayName, right, total: mine.length };
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
      <PageHeader title="🎯 Stakes" accentBg="bg-accent-forest text-white" />
      <ClaimForm members={members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.displayName }))} />

      {ledger.length > 0 && (
        <Card className="tilt-l">
          <p className="brutal-label">📒 The favor ledger</p>
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
          <p className="brutal-label">🔮 Oracle standings</p>
          <ul className="space-y-1.5">
            {standings.map((s, i) => (
              <li key={s.name} className="flex items-center gap-2 text-sm">
                <span className="font-display font-bold">{i === 0 ? "👑" : `${i + 1}.`}</span>
                <Avatar name={s.name} size="sm" />
                <span className="font-bold">{s.name}</span>
                <Badge className="ml-auto bg-paper">
                  {s.right}/{s.total} · {Math.round((s.right / s.total) * 100)}%
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {claims.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="No claims on the record"
          hint="Call a shot. Put a coffee on it. Become the oracle."
        />
      ) : (
        <>
          {open.length > 0 && (
            <ul className="space-y-4">
              {open.map((c) => (
                <ClaimCard key={c.id} claim={toView(c)} />
              ))}
            </ul>
          )}
          {resolved.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink/50">
                The record
              </h2>
              <ul className="space-y-4">
                {resolved.map((c) => (
                  <ClaimCard key={c.id} claim={toView(c)} />
                ))}
              </ul>
            </section>
          )}
        </>
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
                    ☠️ {f.text}{" "}
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
    </div>
  );
}
