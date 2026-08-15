import { Badge } from "@/components/ui";
import { LogSessionButton } from "@/modules/fitness/LogSessionButton";
import { planDoc, type PlanDoc } from "@/modules/fitness/schema";

/**
 * Read-only rendering of a program doc: one brutal card per training day,
 * superset blocks grouped, the set/rep/load math in mono. Server-safe (no
 * client hooks) so the detail page and future surfaces share one renderer.
 */

/** Defensive doc parse for rendering — junk Json renders as nothing, not a crash. */
export function coerceDoc(raw: unknown): PlanDoc | null {
  const parsed = planDoc.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function exerciseMeta(ex: PlanDoc["days"][number]["blocks"][number]["exercises"][number]): string {
  const scheme = [
    ex.sets != null && ex.reps ? `${ex.sets}×${ex.reps}` : ex.sets != null ? `${ex.sets} sets` : ex.reps,
    ex.load,
    ex.rest ? `rest ${ex.rest}` : null,
  ].filter(Boolean);
  return scheme.join(" · ");
}

export function PlanDocView({ doc, planId }: { doc: PlanDoc; planId?: string }) {
  return (
    <div className="space-y-4">
      {doc.days.map((day, di) => (
        <section key={di} className={`brutal-card p-0 ${di % 2 === 0 ? "tilt-l" : "tilt-r"}`}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b-3 border-ink bg-accent-bronze px-4 py-2">
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
              {day.name}
            </h3>
            <span className="flex items-center gap-2">
              {day.focus && <Badge className="bg-paper">{day.focus}</Badge>}
              {planId && <LogSessionButton planId={planId} dayIndex={di} />}
            </span>
          </header>
          <div className="divide-y-2 divide-ink/10">
            {day.blocks.map((block, bi) => (
              <div key={bi} className="px-4 py-3">
                {block.label && (
                  <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-ink/60">
                    ⛓ {block.label}
                  </p>
                )}
                <ul className={`space-y-2 ${block.label ? "border-l-3 border-ink/20 pl-3" : ""}`}>
                  {block.exercises.map((ex, ei) => (
                    <li key={ei} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <div className="min-w-0">
                        <span className="font-display font-bold">{ex.name}</span>
                        {ex.notes && (
                          <p className="text-xs text-ink/60">{ex.notes}</p>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-sm text-ink/80">
                        {exerciseMeta(ex) || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
