import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { recipeInput } from "@/modules/cookbook/schema";

export const GET = apiHandler(async () => {
  await requireUser();
  const recipes = await db.recipe.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ recipes });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, recipeInput);

  const recipe = await withOutbox(
    (tx) =>
      tx.recipe.create({
        data: {
          authorId: user.id,
          title: data.title,
          body: data.body,
          imageKey: data.imageKey ?? null,
        },
      }),
    (r) => ({
      type: "recipe.created",
      payload: { recipeId: r.id, title: r.title, authorId: user.id },
    })
  );

  return NextResponse.json({ recipe }, { status: 201 });
});
