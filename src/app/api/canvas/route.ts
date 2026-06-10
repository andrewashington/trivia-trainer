import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";

export type StrokeDTO = {
  id: string;
  tool: string;
  color: string;
  size: number;
  points: [number, number][];
  stamp: string | null;
  createdAt: string;
  userId: string;
  userName: string;
};

type StrokeRow = {
  id: string;
  tool: string;
  color: string;
  size: number;
  points: unknown;
  stamp: string | null;
  createdAt: Date;
  userId: string;
  user: { displayName: string };
};

function toDTO(s: StrokeRow): StrokeDTO {
  return {
    id: s.id,
    tool: s.tool,
    color: s.color,
    size: s.size,
    points: s.points as [number, number][],
    stamp: s.stamp,
    createdAt: s.createdAt.toISOString(),
    userId: s.userId,
    userName: s.user.displayName,
  };
}

export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const since = new URL(req.url).searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  let strokes: StrokeRow[];
  if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
    strokes = await db.canvasStroke.findMany({
      where: { createdAt: { gt: sinceDate } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { displayName: true } } },
    });
  } else {
    // Most recent 2000, returned in ascending order for painting.
    const recent = await db.canvasStroke.findMany({
      orderBy: { createdAt: "desc" },
      take: 2000,
      include: { user: { select: { displayName: true } } },
    });
    strokes = recent.reverse();
  }

  return NextResponse.json({
    strokes: strokes.map(toDTO),
    serverTime: new Date().toISOString(),
  });
});

const strokeInput = z.object({
  tool: z.enum(["pen", "marker", "highlighter", "stamp"]),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Expected a #hex color."),
  size: z.number().int().min(1).max(64),
  points: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .min(1)
    .max(2000),
  stamp: z.string().min(1).max(16).optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, strokeInput);

  const stroke = await withOutbox(
    async (tx) =>
      tx.canvasStroke.create({
        data: {
          userId: user.id,
          tool: data.tool,
          color: data.color,
          size: data.size,
          points: data.points,
          stamp: data.tool === "stamp" ? data.stamp ?? null : null,
        },
        include: { user: { select: { displayName: true } } },
      }),
    (s) => ({
      type: "canvas.drew",
      payload: { strokeId: s.id, userId: user.id },
    })
  );

  return NextResponse.json({ stroke: toDTO(stroke) }, { status: 201 });
});
