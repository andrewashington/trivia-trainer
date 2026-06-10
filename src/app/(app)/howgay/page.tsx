import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { GayMeter } from "@/modules/howgay/GayMeter";
import { bracketFor, todayKey } from "@/modules/howgay/lib";

export const metadata = { title: "How Gay?" };
export const dynamic = "force-dynamic";

const MEDALS = ["bg-accent-yellow", "bg-paper", "bg-accent-orange"];

export default async function HowGayPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const date = todayKey();
  const readings = await db.gayReading.findMany({
    where: { date },
    orderBy: [{ percent: "desc" }, { createdAt: "asc" }],
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  const mine = readings.find((r) => r.userId === user.id) ?? null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="How Gay?"
        icon="sparkles"
        accentBg="bg-accent-fuchsia"
        action={
          mine ? (
            <Badge className="bg-accent-fuchsia text-white">{mine.percent}% today</Badge>
          ) : undefined
        }
      />

      <GayMeter initialPercent={mine?.percent ?? null} />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="brutal-label">Today&apos;s board</p>
          <span className="font-mono text-[10px] uppercase text-ink/40">{date}</span>
        </div>

        {readings.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="Nobody has checked yet"
            hint="Press the button. Set the bar."
          />
        ) : (
          <ol className="space-y-2">
            {readings.map((r, i) => {
              const isMe = r.userId === user.id;
              return (
                <li
                  key={r.userId}
                  className={`flex items-center gap-3 border-3 border-ink px-3 py-2 shadow-brutal-sm ${
                    isMe ? "bg-accent-fuchsia/15" : "bg-paper"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink font-display text-sm font-bold ${
                      MEDALS[i] ?? "bg-card"
                    }`}
                  >
                    {i === 0 ? <PixelIcon name="crown" size={16} /> : i + 1}
                  </span>
                  <Link
                    href={`/people/${r.user.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-ink no-underline hover:text-accent-blue"
                  >
                    <Avatar name={r.user.displayName} src={r.user.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display font-bold">
                        {r.user.displayName}
                        {isMe && <span className="text-ink/40"> (you)</span>}
                      </span>
                      <span className="block truncate font-mono text-[10px] uppercase text-ink/50">
                        {bracketFor(r.percent).label}
                      </span>
                    </span>
                  </Link>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                    {r.percent}%
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <p className="font-mono text-[11px] leading-relaxed text-ink/40">
        Readings are deterministic, peer-reviewed by the meter itself, and reset
        at midnight. All results are celebratory. The meter loves you.
      </p>
    </div>
  );
}
