import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireAdmin, requireUser } from "@/lib/session";

const feedbackInput = z.object({
  kind: z.enum(["bug", "idea", "praise"]),
  severity: z.enum(["low", "medium", "high"]).optional(),
  message: z.string().trim().min(1, "Say a little more.").max(4000),
  path: z.string().max(300).optional(),
  // Auto-captured by the client to make reports actionable without
  // back-and-forth. Loosely typed — we just stash it for triage.
  context: z
    .object({
      viewport: z.string().max(40).optional(),
      screen: z.string().max(40).optional(),
      dpr: z.number().optional(),
      locale: z.string().max(40).optional(),
      timezone: z.string().max(60).optional(),
      referrer: z.string().max(300).optional(),
    })
    .partial()
    .optional(),
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
          // Severity only applies to bugs; ideas/praise default low.
          severity: data.kind === "bug" ? data.severity ?? "medium" : "low",
          message: data.message,
          path: data.path ?? "",
          userAgent,
          context: data.context ?? undefined,
        },
      }),
    (f) => ({
      type: "feedback.created",
      payload: { feedbackId: f.id, kind: f.kind, severity: f.severity, from: user.id, path: f.path },
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
