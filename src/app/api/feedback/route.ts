import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireAdmin, requireUser } from "@/lib/session";

const feedbackInput = z.object({
  kind: z.enum(["bug", "idea", "praise"]),
  message: z.string().trim().min(1, "Say a little more.").max(4000),
  path: z.string().max(300).optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, feedbackInput);
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  const feedback = await withOutbox(
    (tx) =>
      tx.feedback.create({
        data: {
          userId: user.id,
          kind: data.kind,
          message: data.message,
          path: data.path ?? "",
          userAgent,
        },
      }),
    (f) => ({
      type: "feedback.created",
      payload: { feedbackId: f.id, kind: f.kind, from: user.id, path: f.path },
    })
  );
  return NextResponse.json({ feedback: { id: feedback.id } }, { status: 201 });
});

// Admin triage list.
export const GET = apiHandler(async () => {
  await requireAdmin();
  const feedback = await db.feedback.findMany({
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { displayName: true } } },
  });
  return NextResponse.json({ feedback });
});
