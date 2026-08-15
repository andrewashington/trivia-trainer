import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { EditPlanClient } from "@/modules/fitness/EditPlanClient";
import { coerceDoc } from "@/modules/fitness/PlanDocView";
import type { PlanDraft } from "@/modules/fitness/normalize";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: { id: string } }) {
  const [user, plan] = await Promise.all([
    currentUser(),
    db.fitnessPlan.findUnique({ where: { id: params.id } }),
  ]);
  if (!plan) notFound();
  if (!user || (user.id !== plan.authorId && user.role !== "admin")) redirect(`/pump/${plan.id}`);

  const doc = coerceDoc(plan.doc);
  if (!doc) redirect(`/pump/${plan.id}`);

  const initial: PlanDraft = {
    title: plan.title,
    blurb: plan.blurb,
    goal: plan.goal,
    daysPerWeek: plan.daysPerWeek,
    equipment: plan.equipment,
    doc,
    sourceText: plan.sourceText,
    sourceUrl: plan.sourceUrl,
    aiUsed: plan.aiUsed,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Rework the program" icon="dumbbell" accentBg="bg-accent-bronze text-ink" />
      <EditPlanClient planId={plan.id} initial={initial} />
    </div>
  );
}
