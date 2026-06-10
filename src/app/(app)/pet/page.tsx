import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PixelIcon } from "@/components/icons";
import { getPetView, MOOD_META } from "@/modules/pet/engine";
import { PetActions } from "@/modules/pet/PetActions";

export const metadata = { title: "The Pet" };
export const dynamic = "force-dynamic";

export default async function PetPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const pet = await getPetView(user.id);
  const meta = MOOD_META[pet.mood];

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="The Pet" icon="robot-face-happy" accentBg="bg-accent-sky" />

      {/* The creature itself */}
      <div className={`brutal-card flex flex-col items-center gap-3 p-8 ${meta.bg}`}>
        <div
          className={`flex h-32 w-32 items-center justify-center border-3 border-ink bg-card shadow-brutal-lg ${
            pet.mood === "thriving" || pet.mood === "happy" ? "animate-wiggle" : ""
          } ${pet.mood === "sleepy" || pet.mood === "sad" ? "tilt-r opacity-90" : "tilt-l"}`}
        >
          <PixelIcon name={meta.face} size={88} />
        </div>
        <p className="text-center font-display text-xl font-bold">
          {pet.name} {meta.line}
        </p>
        <Badge className="bg-card">vibe score: {pet.score}</Badge>
      </div>

      <PetActions name={pet.name} canNudge={pet.canNudge} />

      <Card>
        <p className="brutal-label">This week&apos;s diet</p>
        {pet.diet.length === 0 ? (
          <p className="text-sm italic text-ink/50">
            Nothing yet… {pet.name} feeds on group activity. Post a recipe,
            RSVP to something, call a shot — it all counts.
          </p>
        ) : (
          <ul className="space-y-1">
            {pet.diet.map((d) => (
              <li key={d.label} className="flex items-center gap-2 text-sm">
                <PixelIcon name={d.icon} size={15} className="text-ink/70" />
                <span className="font-bold">{d.count}</span>
                <span className="text-ink/60">{d.label}</span>
              </li>
            ))}
          </ul>
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
