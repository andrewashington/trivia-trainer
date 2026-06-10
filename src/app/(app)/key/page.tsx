import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PixelIcon } from "@/components/icons";
import { KeyQuizForm } from "@/modules/thekey/KeyQuizForm";
import { buildKeyCode } from "@/modules/thekey/keycode";

/** Group census: identity-free aggregates, sealed below 3 cards. */
const CENSUS_MIN = 3;

export const metadata = { title: "The Key" };
export const dynamic = "force-dynamic";

export default async function TheKeyPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // Your card and only your card — nobody else's answers ever leave
  // the database.
  const mine = await db.keySubmission.findUnique({ where: { userId: user.id } });

  // Census inputs: trait columns only, no user ids — aggregated below
  // and never rendered per-row.
  const [filed, memberCount, censusRows] = await Promise.all([
    db.keySubmission.count(),
    db.user.count(),
    db.keySubmission.findMany({
      select: { archetypeLabel: true, curveIntensity: true },
    }),
  ]);

  let census: { topArchetype: string | null; curvedPct: number } | null = null;
  if (filed >= CENSUS_MIN) {
    const tally = new Map<string, number>();
    let curved = 0;
    for (const row of censusRows) {
      if (row.archetypeLabel)
        tally.set(row.archetypeLabel, (tally.get(row.archetypeLabel) ?? 0) + 1);
      if (row.curveIntensity && row.curveIntensity !== "straight") curved++;
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    census = {
      topArchetype: top?.[0] ?? null,
      curvedPct: Math.round((curved / filed) * 100),
    };
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="tilt-l inline-flex items-center gap-2.5 border-3 border-ink bg-accent-eggplant px-4 py-1 text-3xl text-white shadow-brutal">
          <PixelIcon name="door-closed" size={26} />
          The Key
        </h1>
        <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50">
          The hidden field guide — you didn&apos;t find this in the nav
        </p>
      </div>

      <section className="brutal-card bg-card p-4 sm:p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Your card</h2>
        <p className="mb-4 font-mono text-[10px] uppercase tracking-wide text-ink/40">
          For your eyes only · nobody else ever sees your answers · the chart
          assigns your archetype
        </p>
        <KeyQuizForm
          initial={
            mine
              ? {
                  lengthMm: mine.lengthMm,
                  girthMm: mine.girthMm,
                  glansShape: mine.glansShape,
                  shaftProfile: mine.shaftProfile,
                  foreskinStatus: mine.foreskinStatus,
                  pubicHair: mine.pubicHair,
                  veinVisibility: mine.veinVisibility,
                  curveVertical: mine.curveVertical,
                  curveLateral: mine.curveLateral,
                  curveIntensity: mine.curveIntensity,
                  visibility: mine.visibility,
                  keyCode: buildKeyCode(mine),
                  archetypeLabel: mine.archetypeLabel,
                  archetypeBlurb: mine.archetypeBlurb,
                }
              : null
          }
        />
      </section>

      <section className="brutal-card bg-card p-4 sm:p-6">
        <h2 className="mb-1 inline-flex items-center gap-2 font-display text-lg font-bold">
          <PixelIcon name="chart-bar-big" size={18} />
          The census
        </h2>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-ink/40">
          Group-level only · no names, no numbers that point at anyone
        </p>
        {census ? (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-paper px-3 py-2 font-mono text-xs font-bold shadow-brutal-sm">
              <PixelIcon name="door-closed" size={13} /> {filed} of {memberCount} cards filed
            </span>
            {census.topArchetype && (
              <span className="border-2 border-ink bg-accent-eggplant px-3 py-2 font-mono text-xs font-bold text-white shadow-brutal-sm">
                most common: {census.topArchetype}
              </span>
            )}
            <span className="border-2 border-ink bg-accent-yellow px-3 py-2 font-mono text-xs font-bold shadow-brutal-sm">
              {census.curvedPct}% report some curve
            </span>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 border-2 border-dashed border-ink bg-paper px-3 py-2 font-mono text-xs font-bold text-ink/60">
            <PixelIcon name="lock" size={13} /> Sealed until {CENSUS_MIN} cards are filed —{" "}
            {filed} in so far.
          </p>
        )}
      </section>
    </div>
  );
}
