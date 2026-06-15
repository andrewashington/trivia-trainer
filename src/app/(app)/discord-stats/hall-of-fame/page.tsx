import Link from "next/link";
import { getHallOfFame, getActivityByYear } from "@/modules/discord-stats/queries";
import { resolveIdentities } from "@/modules/discord-stats/identity";
import { MessageCard, SectionTitle } from "@/modules/discord-stats/components/parts";

export const dynamic = "force-dynamic";

export default async function HallOfFamePage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const years = (await getActivityByYear()).map((y) => y.year);
  const sel = searchParams.year ? Number(searchParams.year) : null;
  const year = sel && years.includes(sel) ? sel : null;

  const fame = await getHallOfFame({ year: year ?? undefined, limit: 30 });
  const ids = await resolveIdentities(fame.map((f) => ({ authorId: f.authorId, authorName: f.authorName })));

  const chip = (label: string, value: number | null) => {
    const active = value === year;
    const href = value ? `/discord-stats/hall-of-fame?year=${value}` : "/discord-stats/hall-of-fame";
    return (
      <Link
        key={label}
        href={href}
        className={`border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold uppercase no-underline shadow-brutal-sm ${
          active ? "bg-accent-blurple text-white" : "bg-card text-ink"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <SectionTitle>The most-reacted messages of {year ?? "all time"}</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {chip("All time", null)}
        {[...years].reverse().map((y) => chip(String(y), y))}
      </div>
      {fame.length === 0 ? (
        <p className="text-sm text-ink/50">No reactions recorded for that year.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fame.map((m) => (
            <MessageCard key={m.messageId} msg={m} identity={ids.get(m.authorId)!} />
          ))}
        </div>
      )}
    </div>
  );
}
