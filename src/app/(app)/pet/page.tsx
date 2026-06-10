import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { getPetView, MOOD_META } from "@/modules/pet/engine";
import { PetStage } from "@/modules/pet/PetStage";

export const metadata = { title: "The Pet" };
export const dynamic = "force-dynamic";

export default async function PetPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const pet = await getPetView(user.id);
  const meta = MOOD_META[pet.mood];

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="The Pet" icon="downasaur" accentBg="bg-accent-sky" />

      <PetStage
        name={pet.name}
        mood={pet.mood}
        moodLine={meta.line}
        moodBg={meta.bg}
        canNudge={pet.canNudge}
        stage={pet.stage}
        beloved={pet.beloved}
        partOfDay={pet.partOfDay}
      />

      <Card>
        <p className="brutal-label">This week&apos;s diet</p>
        {pet.diet.length === 0 ? (
          <p className="text-sm italic text-ink/50">
            Nothing yet… {pet.name} feeds on group activity. Post a recipe,
            RSVP to something, call a shot — it all counts.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pet.diet.map((d) => (
              <span
                key={d.label}
                title={`${d.count} ${d.label}`}
                className="inline-flex items-center gap-1.5 border-3 border-ink bg-paper px-2 py-1 shadow-brutal-sm"
              >
                <PixelIcon name={d.icon} size={16} className="text-ink/80" />
                <span className="font-mono text-xs font-bold">{d.count}</span>
                <span className="text-xs text-ink/60">{d.label}</span>
              </span>
            ))}
          </div>
        )}
        {pet.nudgesToday > 0 && (
          <p className="mt-2 font-mono text-[10px] uppercase text-ink/40">
            + {pet.nudgesToday} pat{pet.nudgesToday === 1 ? "" : "s"} today
          </p>
        )}
      </Card>

      <p className="font-mono text-[11px] leading-relaxed text-ink/40">
        {pet.name}&apos;s mood is the whole group&apos;s — it reflects everyone
        together, never any one person. It can&apos;t die. A quiet week just
        makes it sleepy, and literally anything anyone does perks it up.
      </p>
    </div>
  );
}
