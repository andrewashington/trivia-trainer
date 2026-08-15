import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { coerceDoc } from "@/modules/fitness/PlanDocView";
import { countLifts, planDoc } from "@/modules/fitness/schema";

type Ctx = { params: { id: string } };

// Fork: copy a program into your own editable cut ("PPL — Chandler's Cut").
// The house has no co-editing anywhere — remixing IS the collaboration model.
export const POST = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const source = await db.fitnessPlan.findUnique({ where: { id: params.id } });
  if (!source) throw new HttpError(404, "Program not found.");
  const doc = coerceDoc(source.doc);
  if (!doc) throw new HttpError(400, "That program's structure is broken — nothing to fork.");

  const title = `${source.title} — ${user.displayName}'s Cut`.slice(0, 160);
  const plan = await withOutbox(
    (tx) =>
      tx.fitnessPlan.create({
        data: {
          authorId: user.id,
          title,
          blurb: source.blurb,
          goal: source.goal,
          daysPerWeek: source.daysPerWeek,
          equipment: source.equipment,
          doc: planDoc.parse(doc),
          sourceText: source.sourceText,
          sourceUrl: source.sourceUrl,
          aiUsed: source.aiUsed,
          forkedFromId: source.id,
        },
      }),
    (p) => ({
      type: "fitness.plan.created",
      payload: {
        planId: p.id,
        title: p.title,
        authorId: user.id,
        days: doc.days.length,
        lifts: countLifts(doc),
      },
    })
  );

  return NextResponse.json({ plan }, { status: 201 });
});
