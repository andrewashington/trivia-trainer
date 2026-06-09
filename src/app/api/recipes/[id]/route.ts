import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { assertCanModify, HttpError, requireUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";
import { recipePatch } from "@/modules/cookbook/schema";

type Ctx = { params: { id: string } };

async function findRecipe(id: string) {
  const recipe = await db.recipe.findUnique({
    where: { id },
    include: { author: { select: { id: true, displayName: true } } },
  });
  if (!recipe) throw new HttpError(404, "Recipe not found.");
  return recipe;
}

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  return NextResponse.json({ recipe: await findRecipe(params.id) });
});

export const PATCH = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findRecipe(params.id);
  assertCanModify(user, existing.authorId);
  const data = await parseBody(req, recipePatch);

  const recipe = await withOutbox(
    (tx) => tx.recipe.update({ where: { id: existing.id }, data }),
    (r) => ({
      type: "recipe.updated",
      payload: { recipeId: r.id, title: r.title, editedBy: user.id },
    })
  );
  return NextResponse.json({ recipe });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await findRecipe(params.id);
  assertCanModify(user, existing.authorId);

  await withOutbox(
    (tx) => tx.recipe.delete({ where: { id: existing.id } }),
    () => ({
      type: "recipe.deleted",
      payload: { recipeId: existing.id, title: existing.title, deletedBy: user.id },
    })
  );
  if (existing.imageKey) {
    // Best-effort: an orphaned object is harmless, a failed delete
    // shouldn't fail the request after the DB commit.
    deleteObject(existing.imageKey).catch(() => {});
  }
  return NextResponse.json({ ok: true });
});
