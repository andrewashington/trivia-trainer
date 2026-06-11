import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { WalletView } from "./WalletView";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const CHART_DAYS = 90; // keep the SVG path readable; older history rolls off

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function labelOf(t: { reason: string; meta: unknown }): string {
  if (t.meta && typeof t.meta === "object" && "label" in t.meta) {
    const l = (t.meta as { label?: unknown }).label;
    if (typeof l === "string" && l) return l;
  }
  return t.reason;
}

export default async function WalletPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // Full ledger, oldest first: the running sum reconstructs the balance at
  // every point in time, and the same pass feeds the stats + breakdown.
  const all = await db.coinTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true, reason: true, meta: true, createdAt: true },
  });

  let running = 0;
  let peak = 0;
  let peakAt: Date | null = null;
  let totalEarned = 0;
  let totalSpent = 0;
  let netWeek = 0;
  const weekAgo = Date.now() - 7 * DAY;
  const dayClose = new Map<string, number>(); // yyyy-mm-dd -> closing balance
  const earnBySource = new Map<string, number>();

  for (const t of all) {
    running += t.amount;
    if (t.amount >= 0) totalEarned += t.amount;
    else totalSpent += -t.amount;
    if (running > peak) {
      peak = running;
      peakAt = t.createdAt;
    }
    if (t.createdAt.getTime() >= weekAgo) netWeek += t.amount;
    dayClose.set(dayKey(t.createdAt), running);
    if (t.amount > 0) {
      const k = labelOf(t);
      earnBySource.set(k, (earnBySource.get(k) ?? 0) + t.amount);
    }
  }

  // Continuous daily closing balances, carrying the last balance across idle
  // days, bounded to the most recent CHART_DAYS so the path stays legible.
  const sparse = [...dayClose.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const series: { t: string; v: number }[] = [];
  if (sparse.length) {
    const endMs = new Date(dayKey(new Date()) + "T00:00:00Z").getTime();
    const firstMs = new Date(sparse[0][0] + "T00:00:00Z").getTime();
    const startMs = Math.max(firstMs, endMs - (CHART_DAYS - 1) * DAY);
    const startKey = dayKey(new Date(startMs));
    let si = 0;
    let carry = 0;
    while (si < sparse.length && sparse[si][0] < startKey) carry = sparse[si++][1];
    for (let cur = startMs; cur <= endMs; cur += DAY) {
      const k = dayKey(new Date(cur));
      while (si < sparse.length && sparse[si][0] === k) carry = sparse[si++][1];
      series.push({ t: k, v: carry });
    }
  }

  const sources = [...earnBySource.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const recent = all
    .slice(-25)
    .reverse()
    .map((t) => ({
      id: t.id,
      amount: t.amount,
      reason: t.reason,
      label: labelOf(t),
      createdAt: t.createdAt.toISOString(),
    }));

  return (
    <WalletView
      coins={user.coins}
      series={series}
      stats={{
        earned: totalEarned,
        spent: totalSpent,
        peak,
        peakAt: peakAt ? peakAt.toISOString() : null,
        netWeek,
        ledgerCount: all.length,
      }}
      sources={sources}
      recent={recent}
    />
  );
}
