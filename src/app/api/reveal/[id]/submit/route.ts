import { NextResponse } from "next/server";
import { apiHandler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { withOutbox } from "@/lib/outbox";
import { HttpError, requireUser } from "@/lib/session";
import { submissionInput } from "@/modules/reveal/schema";
import { sweepReveals } from "@/modules/reveal/engine";

type Ctx = { params: { id: string } };

// Lock in a blind submission. No edits, no takebacks — that's the game.
export const POST = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const prompt = await db.revealPrompt.findUnique({ where: { id: params.id } });
  if (!prompt) throw new HttpError(404, "Prompt not found.");
  if (prompt.type === "sealed") {
    throw new HttpError(400, "Sealed notes don't take submissions.");
  }
  if (prompt.status === "revealed") {
    throw new HttpError(409, "Already revealed — too late!");
  }

  const data = await parseBody(req, submissionInput);

  let payload: { order: number[] } | { value: number };
  if (prompt.type === "rank") {
    const items = (prompt.items as string[]) ?? [];
    const order = data.order ?? [];
    const isPermutation =
      order.length === items.length &&
      new Set(order).size === items.length &&
      order.every((i) => i >= 0 && i < items.length);
    if (!isPermutation) {
      throw new HttpError(400, "Rank every item exactly once.");
    }
    payload = { order };
  } else {
    const max = prompt.scaleMax ?? 10;
    if (data.value === undefined || data.value < 1 || data.value > max) {
      throw new HttpError(400, `Answer must be 1–${max}.`);
    }
    payload = { value: data.value };
  }

  await withOutbox(
    async (tx) => {
      try {
        await tx.revealSubmission.create({
          data: { promptId: prompt.id, userId: user.id, payload },
        });
      } catch {
        // Unique (promptId, userId) violation: already locked in.
        throw new HttpError(409, "You're locked in — submissions can't be changed.");
      }
    },
    // Submission CONTENT never reaches the outbox — only the fact.
    () => ({
      type: "reveal.submitted",
      payload: { promptId: prompt.id, title: prompt.title, userId: user.id },
    })
  );

  // The last submitter may complete the set — flip immediately so they
  // see the reveal moment on the very next render.
  await sweepReveals();

  return NextResponse.json({ ok: true }, { status: 201 });
});
