import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/**
 * POST /api/world/house/layout — persist a decorate session's placements.
 * The scene owns the coordinates (it ran the drag/snap), so it batches the
 * final state here: each entry sets x/y/rotation (placed) or nulls them
 * (returned to storage). No coins move — ownership is re-checked per row
 * (updateMany scoped to the caller) so you can only move your own things.
 */
const placement = z.object({
  ownedId: z.string().min(1),
  x: z.number().int().min(0).max(8192).nullable(),
  y: z.number().int().min(0).max(8192).nullable(),
  rotation: z.number().int().min(0).max(1),
});
const layoutInput = z.object({
  placements: z.array(placement).max(500),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { placements } = await parseBody(req, layoutInput);
  if (placements.length === 0) return NextResponse.json({ ok: true, saved: 0 });

  await db.$transaction(
    placements.map((p) =>
      db.worldOwnedItem.updateMany({
        where: { id: p.ownedId, userId: user.id },
        // A half-set position is meaningless; null both together.
        data: {
          x: p.x === null || p.y === null ? null : p.x,
          y: p.x === null || p.y === null ? null : p.y,
          rotation: p.rotation,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, saved: placements.length });
});
