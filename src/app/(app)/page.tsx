import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { sortedModules } from "@/modules/registry";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const user = await currentUser();
  const [nextEvent, latestRecipe, activeCount, fileCount] = await Promise.all([
    db.event.findFirst({
      where: { startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      include: { rsvps: true },
    }),
    db.recipe.findFirst({
      orderBy: { createdAt: "desc" },
      include: { author: { select: { displayName: true } } },
    }),
    db.nowPlayingItem.count({ where: { status: "active" } }),
    db.fileObject.count(),
  ]);

  const firstName = user?.displayName.split(" ")[0] ?? "friend";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1 font-mono text-sm uppercase tracking-widest text-ink/50">
          The group home base
        </p>
      </div>

      {/* What's-new tiles, one per module, in module accent colors. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Link href={nextEvent ? `/events/${nextEvent.id}` : "/events"} className="no-underline">
          <Card className="tilt-l h-full transition-transform hover:-translate-y-1">
            <Badge className="bg-accent-blue text-white">📅 Next up</Badge>
            {nextEvent ? (
              <>
                <p className="mt-2 font-display text-xl font-bold">{nextEvent.title}</p>
                <p className="mt-1 text-sm text-ink/60">
                  {nextEvent.startAt.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {nextEvent.rsvps.filter((r) => r.status === "going").length} going
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/60">
                Nothing on the calendar. Plan something →
              </p>
            )}
          </Card>
        </Link>

        <Link
          href={latestRecipe ? `/cookbook/${latestRecipe.id}` : "/cookbook"}
          className="no-underline"
        >
          <Card className="tilt-r h-full transition-transform hover:-translate-y-1">
            <Badge className="bg-accent-red text-white">🍳 Fresh recipe</Badge>
            {latestRecipe ? (
              <>
                <p className="mt-2 font-display text-xl font-bold">{latestRecipe.title}</p>
                <p className="mt-1 text-sm text-ink/60">
                  by {latestRecipe.author.displayName}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/60">
                The cookbook is empty. Add the first one →
              </p>
            )}
          </Card>
        </Link>

        <Link href="/nowplaying" className="no-underline">
          <Card className="tilt-r h-full transition-transform hover:-translate-y-1">
            <Badge className="bg-accent-yellow">📺 Now playing</Badge>
            <p className="mt-2 text-sm text-ink/60">
              {activeCount > 0
                ? `${activeCount} thing${activeCount === 1 ? "" : "s"} being watched & read right now`
                : "Nobody's watching anything?! Fix that →"}
            </p>
          </Card>
        </Link>

        <Link href="/files" className="no-underline">
          <Card className="tilt-l h-full transition-transform hover:-translate-y-1">
            <Badge className="bg-accent-green">📦 The vault</Badge>
            <p className="mt-2 text-sm text-ink/60">
              {fileCount > 0
                ? `${fileCount} file${fileCount === 1 ? "" : "s"} in the shared stash`
                : "No files yet. Drop something in →"}
            </p>
          </Card>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {sortedModules().map((m) => (
          <Link key={m.key} href={m.href} className="no-underline">
            <span
              className={`brutal-press inline-block border-2 border-ink px-3 py-1 font-mono text-xs font-bold uppercase shadow-brutal-sm ${m.accentBg} ${
                m.key === "events" ? "text-white" : ""
              } ${m.key === "cookbook" ? "text-white" : ""}`}
            >
              {m.icon} {m.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
