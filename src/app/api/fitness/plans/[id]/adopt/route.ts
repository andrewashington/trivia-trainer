import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { abandonPlan, adoptPlan } from "@/modules/fitness/service";

type Ctx = { params: { id: string } };

// "Run it": enlist in a program. Same service call as the Discord button.
export const POST = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const plan = await adoptPlan(user.id, params.id);
  return NextResponse.json({ ok: true, title: plan.title }, { status: 201 });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await abandonPlan(user.id, params.id);
  return NextResponse.json({ ok: true });
});
