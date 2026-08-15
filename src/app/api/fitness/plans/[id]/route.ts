import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { fitnessPlanPatch } from "@/modules/fitness/schema";

type Ctx = { params: { id: string } };

async function findPlan(id: string) {
  const plan = await db.fitnessPlan.findUnique({ where: { id } });
  if (!plan) throw new HttpError(404, "Program not found.");
  return plan;
}

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  return NextResponse.json({ plan: await findPlan(params.id) });
});

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findPlan(params.id);
  assertCanModify(user, existing.authorId);
  const data = await parseBody(req, fitnessPlanPatch);

  const plan = await withOutbox(
    (tx) =>
      tx.fitnessPlan.update({
        where: { id: existing.id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.blurb !== undefined ? { blurb: data.blurb } : {}),
          ...(data.goal !== undefined ? { goal: data.goal } : {}),
          ...(data.daysPerWeek !== undefined ? { daysPerWeek: data.daysPerWeek } : {}),
          ...(data.equipment !== undefined ? { equipment: data.equipment } : {}),
          ...(data.doc !== undefined ? { doc: data.doc } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      }),
    (p) => ({
      type: "fitness.plan.updated",
      payload: { planId: p.id, title: p.title, editedBy: user.id },
    })
  );
  return NextResponse.json({ plan });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findPlan(params.id);
  assertCanModify(user, existing.authorId);

  // Adoptions cascade with the plan; logs keep their denormalized dayName and
  // just lose the planId (SET NULL) — the workouts still happened.
  await withOutbox(
    (tx) => tx.fitnessPlan.delete({ where: { id: existing.id } }),
    () => ({
      type: "fitness.plan.deleted",
      payload: { planId: existing.id, title: existing.title, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
