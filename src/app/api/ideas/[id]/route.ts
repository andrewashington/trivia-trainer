import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { ideaPatch } from "@/modules/ideas/schema";

type Ctx = { params: { id: string } };

async function findIdea(id: string) {
  const idea = await db.idea.findUnique({ where: { id } });
  if (!idea) throw new HttpError(404, "Idea not found.");
  return idea;
}

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findIdea(params.id);
  const data = await parseBody(req, ideaPatch);

  // Title/detail edits: author or admin. Status moves: admin only —
  // the suggestion box stays honest if authors can't mark their own
  // ideas as "planned".
  if (data.title !== undefined || data.detail !== undefined) {
    assertCanModify(user, existing.authorId);
  }
  if (data.status !== undefined && user.role !== "admin") {
    throw new HttpError(403, "Only an admin can move an idea's status.");
  }

  const idea = await withOutbox(
    (tx) => tx.idea.update({ where: { id: existing.id }, data }),
    (i) => ({
      type: "idea.updated",
      payload: { ideaId: i.id, title: i.title, status: i.status, editedBy: user.id },
    })
  );
  return NextResponse.json({ idea });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findIdea(params.id);
  assertCanModify(user, existing.authorId);

  await withOutbox(
    (tx) => tx.idea.delete({ where: { id: existing.id } }),
    () => ({
      type: "idea.deleted",
      payload: { ideaId: existing.id, title: existing.title, deletedBy: user.id },
    })
  );
  return NextResponse.json({ ok: true });
});
