import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { coerceDoc } from "@/modules/fitness/PlanDocView";
import { WorkoutMode } from "@/modules/fitness/WorkoutMode";

export const metadata = { title: "Workout Mode · The Pump" };
export const dynamic = "force-dynamic";

export default async function TrainPage({ params }: { params: { id: string } }) {
  const [user, plan] = await Promise.all([
    currentUser(),
    db.fitnessPlan.findUnique({ where: { id: params.id } }),
  ]);
  if (!user) redirect("/signin");
  if (!plan) notFound();
  const doc = coerceDoc(plan.doc);
  if (!doc) redirect(`/pump/${plan.id}`);

  return <WorkoutMode planId={plan.id} title={plan.title} doc={doc} />;
}
