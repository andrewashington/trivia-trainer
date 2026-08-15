import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { prDisplay } from "@/modules/fitness/lifts";
import { PrDeleteButton, PrForm } from "@/modules/fitness/PrForm";

export const metadata = { title: "The Wall · The Pump" };
export const dynamic = "force-dynamic";

export default async function WallPage() {
  const [user, prs] = await Promise.all([
    currentUser(),
    db.fitnessPr.findMany({ orderBy: { e1rm: "desc" } }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(prs.map((p) => p.userId))] } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const who = new Map(users.map((u) => [u.id, u]));

  // Best entry per person per lift, then lifts ranked by how contested they
  // are (more lifters first), each showing its podium.
  const bestByUserLift = new Map<string, (typeof prs)[number]>();
  for (const pr of prs) {
    const k = `${pr.userId}:${pr.liftKey}`;
    if (!bestByUserLift.has(k)) bestByUserLift.set(k, pr);
  }
  const byLift = new Map<string, (typeof prs)[number][]>();
  for (const pr of bestByUserLift.values()) {
    byLift.set(pr.liftKey, [...(byLift.get(pr.liftKey) ?? []), pr]);
  }
  const lifts = [...byLift.entries()]
    .map(([key, rows]) => ({ key, rows: rows.sort((a, b) => b.e1rm - a.e1rm) }))
    .sort((a, b) => b.rows.length - a.rows.length || b.rows[0].e1rm - a.rows[0].e1rm);

  const recent = [...prs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 12);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div>
      <PageHeader
        title="The Wall"
        icon="trophy"
        accentBg="bg-accent-bronze text-ink"
        action={<LinkButton href="/pump" variant="ghost">← The Pump</LinkButton>}
      />

      <Card className="mb-6">
        <p className="brutal-label">Claim a feat of strength</p>
        <p className="mb-3 text-sm text-ink/60">
          Self-reported. Lying is between you and God — and the group chat.
        </p>
        <PrForm />
      </Card>

      {prs.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="The Wall is bare"
          hint="Zero recorded feats of strength. Embarrassing, honestly."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {lifts.map(({ key, rows }, i) => (
              <Card key={key} className={i % 2 === 0 ? "tilt-l" : "tilt-r"}>
                <p className="font-display text-lg font-bold uppercase tracking-wide">{key}</p>
                <ul className="mt-2 space-y-2">
                  {rows.slice(0, 3).map((pr, rank) => {
                    const u = who.get(pr.userId);
                    return (
                      <li key={pr.id} className="flex items-center justify-between gap-3">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span>{medals[rank] ?? "·"}</span>
                          {u && <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />}
                          <span className="truncate font-bold">{u?.displayName ?? "?"}</span>
                        </span>
                        <span className="shrink-0 font-mono text-sm">
                          {prDisplay(pr.weight, pr.reps, pr.unit)}
                          <span className="text-ink/40"> · {Math.round(pr.e1rm)} e1RM</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>

          <div>
            <h2 className="brutal-label">Freshly chiseled</h2>
            <ul className="mt-2 space-y-2">
              {recent.map((pr) => {
                const u = who.get(pr.userId);
                const mine = user && (user.id === pr.userId || user.role === "admin");
                return (
                  <li key={pr.id} className="brutal-card flex items-center justify-between gap-3 !p-3">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {u && <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />}
                      <span className="min-w-0 truncate">
                        <span className="font-bold">{u?.displayName ?? "?"}</span>{" "}
                        <span className="font-mono text-sm">
                          {pr.lift} {prDisplay(pr.weight, pr.reps, pr.unit)}
                        </span>
                        {pr.note && <span className="text-sm text-ink/50"> — {pr.note}</span>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink/40">
                      {pr.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {mine && <PrDeleteButton prId={pr.id} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
