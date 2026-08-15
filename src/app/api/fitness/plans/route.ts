import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { countLifts, fitnessPlanInput } from "@/modules/fitness/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const plans = await db.fitnessPlan.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ plans });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, fitnessPlanInput);

  const plan = await withOutbox(
    (tx) =>
      tx.fitnessPlan.create({
        data: {
          authorId: user.id,
          title: data.title,
          blurb: data.blurb ?? null,
          goal: data.goal ?? null,
          daysPerWeek: data.daysPerWeek ?? null,
          equipment: data.equipment ?? null,
          doc: data.doc,
          sourceText: data.sourceText ?? null,
          sourceUrl: data.sourceUrl ?? null,
          aiUsed: data.aiUsed,
        },
      }),
    (p) => ({
      type: "fitness.plan.created",
      payload: {
        planId: p.id,
        title: p.title,
        authorId: user.id,
        days: data.doc.days.length,
        lifts: countLifts(data.doc),
      },
    })
  );

  return NextResponse.json({ plan }, { status: 201 });
});
