import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { requireUser } from "@/lib/session";
import { promptInput } from "@/modules/reveal/schema";
import { sweepReveals, toPromptView } from "@/modules/reveal/engine";

export const GET = apiHandler(async () => {
  const user = await requireUser();
  await sweepReveals();
  const [prompts, memberCount] = await Promise.all([
    db.revealPrompt.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, displayName: true } },
        submissions: { include: { user: { select: { id: true, displayName: true } } } },
      },
    }),
    db.user.count(),
  ]);
  return NextResponse.json({
    prompts: prompts.map((p) => toPromptView(p, user, memberCount)),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const data = await parseBody(req, promptInput);

  const prompt = await withOutbox(
    async (tx) => {
      const prompt = await tx.revealPrompt.create({
        data: {
          creatorId: user.id,
          type: data.type,
          title: data.title,
          items: data.type === "rank" ? data.items : undefined,
          scaleMax: data.type === "oracle" ? (data.scaleMax ?? 10) : null,
          deadline: data.type === "sealed" ? null : (data.deadline ?? null),
          unlockAt: data.type === "sealed" ? data.unlockAt : null,
        },
      });
      if (data.type === "sealed") {
        // The note body goes straight into a hidden submission — the
        // API never echoes it back to anyone before unlockAt.
        await tx.revealSubmission.create({
          data: {
            promptId: prompt.id,
            userId: user.id,
            payload: { body: data.sealedBody! },
          },
        });
      }
      return prompt;
    },
    (p) => ({
      type: "reveal.created",
      payload: { promptId: p.id, title: p.title, type: p.type, createdBy: user.id },
    })
  );

  return NextResponse.json({ prompt: { id: prompt.id } }, { status: 201 });
});
