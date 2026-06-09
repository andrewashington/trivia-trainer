import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const prompt = await db.revealPrompt.findUnique({ where: { id: params.id } });
  if (!prompt) throw new HttpError(404, "Prompt not found.");
  assertCanModify(user, prompt.creatorId);

  await withOutbox(
    (tx) => tx.revealPrompt.delete({ where: { id: prompt.id } }),
    () => ({
      type: "reveal.deleted",
      payload: { promptId: prompt.id, title: prompt.title, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
